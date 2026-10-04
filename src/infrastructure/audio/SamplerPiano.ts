import type { AudioOutput } from '../../application/ports/AudioOutput';
import { nearestRecorded, onsetSeconds, playbackRate, velocityGain, type PianoLayer, type PianoManifest } from './pianoSamples';

interface Sample {
  readonly buffer: AudioBuffer;
  /** Where the sound starts in the buffer (see onsetSeconds). */
  readonly onset: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

const MASTER_GAIN = 0.5;
/** Time constant of the fade after the key is released: the damper falling on the string. */
const RELEASE = 0.12;
/** With the soft pedal the tone is duller: frequencies above this are turned down. */
const SOFT_CUTOFF_HZ = 2200;

/**
 * A piano played from recorded samples (see pianoSamples). Until the samples are loaded, and if
 * they never load (offline, a blocked request), a fallback output plays instead; the metronome's
 * clicks always come from the fallback.
 */
export class SamplerPiano implements AudioOutput {
  private readonly output: AudioNode;
  private readonly voices = new Set<Voice>();
  /** The loaded layer: its samples by recorded pitch, the pitches in order, and its loudness (0–1). */
  private layer: { samples: Map<number, Sample>; pitches: number[]; recorded: number } | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly fallback: AudioOutput,
  ) {
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(ctx.destination);
    this.output = master;
  }

  /** True once the samples play instead of the fallback. */
  get ready(): boolean {
    return this.layer !== null;
  }

  /**
   * Fetches and decodes the samples under `baseUrl` (where manifest.json is). The piano switches
   * to them when all are in; on a failure it stays on the fallback and the error is thrown.
   */
  async load(baseUrl: string): Promise<void> {
    const manifest = (await (await fetchOk(`${baseUrl}manifest.json`)).json()) as PianoManifest;
    const layer: PianoLayer = manifest.layers[0];
    const samples = new Map<number, Sample>();
    await Promise.all(
      layer.notes.map(async (note) => {
        const data = await (await fetchOk(baseUrl + note.file)).arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data);
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        samples.set(note.pitch, { buffer, onset: onsetSeconds(channels, buffer.sampleRate) });
      }),
    );
    this.layer = {
      samples,
      pitches: layer.notes.map((note) => note.pitch),
      recorded: (layer.velocity[0] + layer.velocity[1]) / 2 / 127,
    };
  }

  now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  playNote(pitch: number, velocity: number, at: number, duration: number, soft = false): void {
    const { ctx, layer } = this;
    if (!layer) {
      this.fallback.playNote(pitch, velocity, at, duration, soft);
      return;
    }
    const recorded = nearestRecorded(layer.pitches, pitch);
    const sample = layer.samples.get(recorded)!;
    const start = Math.max(at, ctx.currentTime);
    const end = start + Math.max(duration, 0.05);

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = playbackRate(recorded, pitch);

    // The sample carries the note's own decay; the gain only sets its loudness and the release.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocityGain(velocity, layer.recorded), start);
    gain.gain.setTargetAtTime(0, end, RELEASE);
    gain.connect(this.output);

    if (soft) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = SOFT_CUTOFF_HZ;
      source.connect(filter).connect(gain);
    } else {
      source.connect(gain);
    }

    const voice: Voice = { source, gain };
    this.voices.add(voice);
    source.start(start, sample.onset);
    source.stop(end + RELEASE * 6);
    source.onended = () => {
      gain.disconnect();
      this.voices.delete(voice);
    };
  }

  playClick(at: number, accent: boolean): void {
    this.fallback.playClick(at, accent);
  }

  stopAll(): void {
    this.fallback.stopAll();
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.015);
      // A stop time earlier than the start time means a future note never sounds.
      voice.source.stop(now + 0.1);
    }
  }
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
