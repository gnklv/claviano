import type { AudioOutput, NoteToPlay } from '../../application/ports/AudioOutput';
import { pitchFrequency } from '../../domain/pitch';

interface Voice {
  readonly gain: GainNode;
  readonly oscillators: readonly OscillatorNode[];
}

const ATTACK = 0.005;
/** Level of the overtone an octave up, and with the soft pedal. */
const OVERTONE = 0.25;
const SOFT_OVERTONE = 0.08;
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
 * The metronome: a short high blip, higher and louder on the first beat of a bar. It bypasses the
 * piano's limiter, so loud chords don't squash it.
 */
const CLICK = {
  accent: { frequency: 1760, level: 0.35 },
  beat: { frequency: 1320, level: 0.2 },
  /** Time constant of its decay: gone in about 30 ms. */
  decay: 0.01,
};

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

  playNote({ pitch, velocity, at, duration, soft }: NoteToPlay): void {
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
    // The soft pedal makes the tone duller: less of the brighter overtone.
    overtoneGain.gain.value = soft ? SOFT_OVERTONE : OVERTONE;
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

  /** The synth has no pedal noise. */
  playPedal(): void {}

  playClick(at: number, accent: boolean): void {
    const { ctx } = this;
    const start = Math.max(at, ctx.currentTime);
    const { frequency, level } = accent ? CLICK.accent : CLICK.beat;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.setTargetAtTime(0, start + 0.002, CLICK.decay);
    gain.connect(ctx.destination);
    const osc = this.oscillator('sine', frequency, gain);
    const voice: Voice = { gain, oscillators: [osc] };
    this.voices.add(voice);
    osc.start(start);
    osc.stop(start + CLICK.decay * 8);
    osc.onended = () => {
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
