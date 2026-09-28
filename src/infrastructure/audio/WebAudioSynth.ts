import type { AudioOutput } from '../../application/ports/AudioOutput';
import { pitchFrequency } from '../../domain/pitch';

interface Voice {
  readonly gain: GainNode;
  readonly oscillators: readonly OscillatorNode[];
}

const ATTACK = 0.005;
/** Time constant of the natural decay of a held key: the quick drop right after the strike… */
const DECAY = 0.6;
/**
 * …and of the long fade that follows, like a string ringing out. Without it a note held by the
 * pedal would stay at the same level forever, and pedalled passages would pile up into a drone.
 */
const RING_OUT = 3;
/** The long fade takes over once the quick drop has mostly happened (three time constants). */
const RING_OUT_FROM = 3 * DECAY;
/** Time constant of the fade after the key is released. */
const RELEASE = 0.08;

/**
 * A small additive synth: a triangle fundamental plus a quiet sine an octave up,
 * with a piano-like envelope (fast attack, a drop and then a slow fade while held, short release).
 * Good enough to hear the music; a sampler can replace it behind the same port.
 */
export class WebAudioSynth implements AudioOutput {
  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly voices = new Set<Voice>();

  constructor(ctx: AudioContext = new AudioContext()) {
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.35;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(ctx.destination);
    this.output = master;
  }

  now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  playNote(pitch: number, velocity: number, at: number, duration: number): void {
    const { ctx } = this;
    const start = Math.max(at, ctx.currentTime);
    const end = start + Math.max(duration, 0.05);
    const peak = 0.1 + 0.4 * velocity;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK);
    gain.gain.setTargetAtTime(peak * 0.15, start + ATTACK, DECAY);
    if (start + ATTACK + RING_OUT_FROM < end) gain.gain.setTargetAtTime(0, start + ATTACK + RING_OUT_FROM, RING_OUT);
    gain.gain.setTargetAtTime(0, end, RELEASE);
    gain.connect(this.output);

    const frequency = pitchFrequency(pitch);
    const fundamental = this.oscillator('triangle', frequency, gain);
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.25;
    overtoneGain.connect(gain);
    const overtone = this.oscillator('sine', frequency * 2, overtoneGain);

    const voice: Voice = { gain, oscillators: [fundamental, overtone] };
    this.voices.add(voice);
    const stopAt = end + RELEASE * 6;
    for (const osc of voice.oscillators) {
      osc.start(start);
      osc.stop(stopAt);
    }
    fundamental.onended = () => {
      gain.disconnect();
      this.voices.delete(voice);
    };
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.015);
      // A stop time earlier than the start time means a future note never sounds.
      for (const osc of voice.oscillators) osc.stop(now + 0.1);
    }
  }

  private oscillator(type: OscillatorType, frequency: number, destination: AudioNode): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(destination);
    return osc;
  }
}
