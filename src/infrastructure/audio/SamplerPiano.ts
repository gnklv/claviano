import type { AudioOutput } from '../../application/ports/AudioOutput';
import type { Instrument, InstrumentStatus } from '../../application/ports/Instrument';
import {
  fetchOrder,
  layerFor,
  nearestRecorded,
  neededRecorded,
  onsetSeconds,
  playbackRate,
  sampleLevel,
  velocityGain,
  type PianoManifest,
} from './pianoSamples';

interface Sample {
  readonly buffer: AudioBuffer;
  /** Where the sound starts in the buffer (see onsetSeconds). */
  readonly onset: number;
  /** How loud it is by itself (see sampleLevel). */
  readonly level: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

/** The sample set: its loudness layers (softest first) and the pitches each is recorded at. */
interface SampleSet {
  readonly baseUrl: string;
  /** For each layer, its files by recorded pitch and the velocity (0–1) it was recorded at. */
  readonly layers: readonly { readonly files: ReadonlyMap<number, string>; readonly recorded: number }[];
  /** The layer fetched first: the piano plays from it alone until the others are in. */
  readonly base: number;
  /** The recorded pitches, lowest first (the same in every layer). */
  readonly pitches: readonly number[];
}

/** Samples fetched at once: enough to fill the connection, few enough for the needed ones to come first. */
const CONCURRENT_FETCHES = 4;
/** A sample that fails to arrive is asked for this many times in all. */
const FETCH_ATTEMPTS = 2;
const MASTER_GAIN = 0.5;
/** Time constant of the fade after the key is released: the damper falling on the string. */
const RELEASE = 0.12;
/** With the soft pedal the tone is duller: frequencies above this are turned down. */
const SOFT_CUTOFF_HZ = 2200;

/**
 * A piano played from recorded samples (see pianoSamples). The samples arrive over the network,
 * those of the piece's notes first, the base layer before the others. Until the base layer has
 * all of the piece's notes, and if they never arrive (offline, a blocked request), a fallback
 * output plays instead: the whole piece, not note by note, so the two sounds never mix. A soft or
 * a loud note whose own layer is not in yet is played from the base layer. The metronome's clicks
 * always come from the fallback.
 */
export class SamplerPiano implements AudioOutput, Instrument {
  private readonly output: AudioNode;
  private readonly voices = new Set<Voice>();
  private readonly listeners = new Set<() => void>();
  private set: SampleSet | null = null;
  /** The samples that are in: for each layer, by recorded pitch; and those asked for ("layer:pitch"). */
  private samples: Map<number, Sample>[] = [];
  private readonly asked = new Set<string>();
  private fetching = 0;
  /** The pitches of the piece being played; null before any piece: then every sample counts. */
  private preferred: readonly number[] | null = null;
  private failed = false;
  private currentStatus: InstrumentStatus = 'loading';

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

  /** 'ready' once the samples play instead of the fallback. */
  get status(): InstrumentStatus {
    return this.currentStatus;
  }

  onStatusChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prefer(pitches: Iterable<number>): void {
    this.preferred = [...new Set(pitches)];
    this.update();
    this.fetchMore();
  }

  /** Starts fetching the samples under `baseUrl` (where manifest.json is), in the background. */
  async load(baseUrl: string): Promise<void> {
    try {
      const manifest = (await (await fetchOk(`${baseUrl}manifest.json`)).json()) as PianoManifest;
      const base = Math.max(0, manifest.layers.findIndex((layer) => layer.id === manifest.base));
      this.samples = manifest.layers.map(() => new Map());
      this.set = {
        baseUrl,
        layers: manifest.layers.map((layer) => ({
          files: new Map(layer.notes.map((note) => [note.pitch, `${note.file}?v=${manifest.version}`])),
          recorded: (layer.velocity[0] + layer.velocity[1]) / 2 / 127,
        })),
        base,
        pitches: manifest.layers[base].notes.map((note) => note.pitch),
      };
    } catch (error) {
      this.fail(error);
      return;
    }
    this.update();
    this.fetchMore();
  }

  /** The recorded pitches the piece is played from (all of them before any piece). */
  private needed(set: SampleSet): Set<number> {
    return this.preferred ? neededRecorded(set.pitches, this.preferred) : new Set(set.pitches);
  }

  /** Keeps CONCURRENT_FETCHES samples on their way, the needed ones first. */
  private fetchMore(): void {
    const { set } = this;
    if (!set || this.failed) return;
    const order = fetchOrder(set.pitches, this.needed(set), set.layers.length, set.base).filter(
      ([layer, pitch]) => !this.asked.has(`${layer}:${pitch}`),
    );
    for (const [layer, pitch] of order.slice(0, CONCURRENT_FETCHES - this.fetching)) {
      this.asked.add(`${layer}:${pitch}`);
      this.fetching++;
      this.fetchSample(set.baseUrl + set.layers[layer].files.get(pitch)!)
        .then((sample) => {
          this.samples[layer].set(pitch, sample);
          this.fetching--;
          this.update();
          this.fetchMore();
        })
        .catch((error: unknown) => this.fail(error));
    }
  }

  private async fetchSample(url: string, attempt = 1): Promise<Sample> {
    try {
      const data = await (await fetchOk(url)).arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(data);
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const onset = onsetSeconds(channels, buffer.sampleRate);
      return { buffer, onset, level: sampleLevel(channels, buffer.sampleRate, onset) };
    } catch (error) {
      if (attempt >= FETCH_ATTEMPTS) throw error;
      return this.fetchSample(url, attempt + 1);
    }
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    console.warn('Piano samples not loaded; playing the synth.', error);
    this.update();
  }

  private update(): void {
    const { set } = this;
    const ready = set !== null && [...this.needed(set)].every((pitch) => this.samples[set.base].has(pitch));
    // What is already in keeps playing even if the rest fails to arrive.
    const status: InstrumentStatus = ready ? 'ready' : this.failed ? 'unavailable' : 'loading';
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    for (const listener of this.listeners) listener();
  }

  now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  playNote(pitch: number, velocity: number, at: number, duration: number, soft = false): void {
    const { ctx, set } = this;
    const recorded = set ? nearestRecorded(set.pitches, pitch) : pitch;
    const base = set ? this.samples[set.base].get(recorded) : undefined;
    if (!set || !base || this.currentStatus !== 'ready') {
      this.fallback.playNote(pitch, velocity, at, duration, soft);
      return;
    }
    // The layer recorded nearest to this strike gives the tone: mellow when soft, bright when loud.
    const own = this.samples[layerFor(set.layers.map((layer) => layer.recorded), velocity)].get(recorded);
    const sample = own && own.level > 0 ? own : base;
    const start = Math.max(at, ctx.currentTime);
    const end = start + Math.max(duration, 0.05);

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = playbackRate(recorded, pitch);

    // The sample carries the note's own decay; the gain only sets its loudness and the release.
    const gain = ctx.createGain();
    // As loud as the base layer would be at this velocity, whichever layer plays: only the tone differs.
    const level = velocityGain(velocity, set.layers[set.base].recorded) * (base.level / sample.level);
    gain.gain.setValueAtTime(level, start);
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
