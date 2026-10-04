import type { AudioOutput, NoteToPlay } from '../../application/ports/AudioOutput';
import type { Instrument, InstrumentStatus, NoteToPrepare } from '../../application/ports/Instrument';
import {
  describeSet,
  layerFor,
  nearestRecorded,
  onsetSeconds,
  PEDAL_GAIN,
  playbackRate,
  releaseGain,
  resonanceGain,
  sampleLevel,
  samplesWanted,
  velocityGain,
  type PianoManifest,
  type SampleSet,
  type SamplesWanted,
} from './pianoSamples';

/** A decoded sample, ready to play. */
interface Sample {
  readonly buffer: AudioBuffer;
  /** Where the sound starts in the buffer (see onsetSeconds). */
  readonly onset: number;
  /** How loud it is by itself (see sampleLevel). */
  readonly level: number;
  /** How many seconds of it were kept (Infinity: all of it). */
  readonly seconds: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

/** Files fetched or decoded at once: enough to fill the connection, few enough for the needed ones to come first. */
const CONCURRENT_TASKS = 4;
/** A sample that fails to arrive is asked for this many times in all. */
const FETCH_ATTEMPTS = 2;
const MASTER_GAIN = 0.5;
/** Time constant of the fade after the key is released: the damper falling on the string. */
const RELEASE = 0.12;
/** With the soft pedal the tone is duller: frequencies above this are turned down. */
const SOFT_CUTOFF_HZ = 2200;
/** A sample cut short ends with a fade this long, so it never stops with a click. */
const CUT_FADE_SECONDS = 0.05;
/** A decoded sample is cut down only when it is more than this many times longer than the notes need. */
const SPARE_LENGTH = 2;

/**
 * A piano played from recorded samples (see pianoSamples).
 *
 * The files are small (6 MB for the whole set) but decoded sound is large: all of it would take
 * 400 MB. So the files are fetched and kept as they are, and only what the notes about to be
 * played need is decoded: the base layer of their pitches, each note's own layer, and no more
 * seconds of a sample than its longest note sounds (see samplesWanted). Another piece, or a slower
 * tempo, decodes what it needs and lets go of the rest.
 *
 * Until the base layer has all of the piece's notes, and if the files never arrive (offline, a
 * blocked request), a fallback output plays instead: the whole piece, not note by note, so the
 * two sounds never mix. A note whose own layer is not decoded yet is played from the base layer.
 * The metronome's clicks always come from the fallback.
 */
export class SamplerPiano implements AudioOutput, Instrument {
  private readonly output: AudioNode;
  private readonly voices = new Set<Voice>();
  private readonly listeners = new Set<() => void>();
  private set: SampleSet | null = null;
  /** The files as fetched, and the decoded samples, both by file. */
  private readonly bytes = new Map<string, ArrayBuffer>();
  private readonly decoded = new Map<string, Sample>();
  /** Files being fetched or decoded now. */
  private readonly busy = new Set<string>();
  /** The notes to be ready for, and what they need (see samplesWanted). */
  private notes: readonly NoteToPrepare[] = [];
  private wanted: SamplesWanted = { files: new Map(), required: new Set(), mono: new Set() };
  private failed = false;
  private currentStatus: InstrumentStatus = 'loading';
  private on = true;
  /** Where the samples are (see start), and whether fetching them has begun. */
  private baseUrl: string | null = null;
  private started = false;

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

  /** Off: the fallback plays instead, and no more samples are fetched. */
  get enabled(): boolean {
    return this.on;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.on) return;
    this.on = enabled;
    this.notify();
    this.begin();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prepare(notes: readonly NoteToPrepare[]): void {
    this.notes = notes;
    this.plan();
  }

  /**
   * Tells where the samples are: under `baseUrl`, beside their manifest.json. They are fetched in
   * the background, from now if the piano is on, or from when it is turned on.
   */
  start(baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.begin();
  }

  /** Begins or goes on fetching, if the piano is on and it is known where from. */
  private begin(): void {
    if (!this.on || this.baseUrl === null) return;
    if (this.started) {
      this.work();
    } else {
      this.started = true;
      void this.load(this.baseUrl);
    }
  }

  private async load(baseUrl: string): Promise<void> {
    try {
      this.set = describeSet((await (await fetchOk(`${baseUrl}manifest.json`)).json()) as PianoManifest);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.plan();
  }

  /** Works out what the notes need, lets go of what they do not, and goes on getting the rest. */
  private plan(): void {
    if (!this.set) return;
    this.wanted = samplesWanted(this.set, this.notes);
    for (const [file, sample] of this.decoded) {
      const seconds = this.wanted.files.get(file);
      if (seconds === undefined) this.decoded.delete(file);
      // Much longer than the notes now need (another piece): cut down, which costs no decoding.
      // A little longer is left alone, so moving the tempo back and forth decodes nothing again.
      else if (sample.seconds > SPARE_LENGTH * seconds) this.decoded.set(file, { ...sample, buffer: this.cut(sample.buffer, sample.onset + seconds, false), seconds });
    }
    this.update();
    this.work();
  }

  /** Enough of `file` is decoded for the notes. */
  private has(file: string): boolean {
    return (this.decoded.get(file)?.seconds ?? -1) >= (this.wanted.files.get(file) ?? Infinity);
  }

  /**
   * Keeps CONCURRENT_TASKS files on their way. First what the notes need, in order: fetched if it
   * is not here yet, then decoded. After that the rest of the set is fetched (not decoded), so
   * another piece finds its files here and the offline cache has them all.
   */
  private work(): void {
    const { set } = this;
    if (!set || this.failed || !this.on || this.baseUrl === null) return;
    const baseUrl = this.baseUrl;
    const run = (file: string, task: Promise<void>) => {
      this.busy.add(file);
      task
        .then(() => {
          this.busy.delete(file);
          this.update();
          this.work();
        })
        .catch((error: unknown) => this.fail(error));
    };
    for (const file of this.wanted.files.keys()) {
      if (this.busy.size >= CONCURRENT_TASKS) return;
      if (this.busy.has(file) || this.has(file)) continue;
      run(file, this.bytes.has(file) ? this.decode(file) : this.fetchBytes(baseUrl, file));
    }
    for (const file of set.files) {
      if (this.busy.size >= CONCURRENT_TASKS) return;
      if (!this.busy.has(file) && !this.bytes.has(file)) run(file, this.fetchBytes(baseUrl, file));
    }
  }

  private async fetchBytes(baseUrl: string, file: string, attempt = 1): Promise<void> {
    try {
      this.bytes.set(file, await (await fetchOk(baseUrl + file)).arrayBuffer());
    } catch (error) {
      if (attempt >= FETCH_ATTEMPTS) throw error;
      await this.fetchBytes(baseUrl, file, attempt + 1);
    }
  }

  /** Decodes a fetched file and keeps as much of it as the notes need now. */
  private async decode(file: string): Promise<void> {
    const seconds = this.wanted.files.get(file) ?? Infinity;
    // Decoding takes the bytes away: it gets a copy, the file stays for another time.
    const full = await this.ctx.decodeAudioData(this.bytes.get(file)!.slice(0));
    const channels = Array.from({ length: full.numberOfChannels }, (_, i) => full.getChannelData(i));
    const onset = onsetSeconds(channels, full.sampleRate);
    const level = sampleLevel(channels, full.sampleRate, onset);
    // The notes may have changed meanwhile: what is not needed any more is not kept.
    if (this.wanted.files.has(file)) {
      this.decoded.set(file, { buffer: this.cut(full, onset + seconds, this.wanted.mono.has(file)), onset, level, seconds });
    }
  }

  /**
   * The first `seconds` of a decoded sample, faded out at the cut, its channels mixed into one for
   * `mono`; the sample itself if there is nothing to cut or mix.
   */
  private cut(full: AudioBuffer, seconds: number, mono: boolean): AudioBuffer {
    const length = Math.min(full.length, Math.ceil(seconds * full.sampleRate));
    const channels = mono ? 1 : full.numberOfChannels;
    if (length === full.length && channels === full.numberOfChannels) return full;
    const short = this.ctx.createBuffer(channels, length, full.sampleRate);
    const fade = length < full.length ? Math.min(length, Math.floor(CUT_FADE_SECONDS * full.sampleRate)) : 0;
    for (let channel = 0; channel < channels; channel++) {
      const data = short.getChannelData(channel);
      data.set(full.getChannelData(channel).subarray(0, length));
      if (mono) {
        for (let other = 1; other < full.numberOfChannels; other++) {
          const more = full.getChannelData(other);
          for (let i = 0; i < length; i++) data[i]! += more[i]!;
        }
        for (let i = 0; i < length; i++) data[i]! /= full.numberOfChannels;
      }
      for (let i = 0; i < fade; i++) data[length - 1 - i]! *= i / fade;
    }
    return short;
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    console.warn('Piano samples not loaded; playing the synth.', error);
    this.update();
  }

  private update(): void {
    const ready = this.set !== null && [...this.wanted.required].every((file) => this.decoded.has(file));
    // What is already in keeps playing even if the rest fails to arrive.
    const status: InstrumentStatus = ready ? 'ready' : this.failed ? 'unavailable' : 'loading';
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  playNote(note: NoteToPlay): void {
    const { pitch, velocity, at, duration, soft, held } = note;
    const { ctx, set } = this;
    const recorded = set ? nearestRecorded(set.pitches, pitch) : pitch;
    const sampleOf = (layer: number) => this.decoded.get(set?.layers[layer]?.get(recorded) ?? '');
    const base = set ? sampleOf(set.base) : undefined;
    if (!set || !base || !this.on || this.currentStatus !== 'ready') {
      this.fallback.playNote(note);
      return;
    }
    // The layer recorded nearest to this strike gives the tone: mellow when soft, bright when loud.
    const own = sampleOf(layerFor(set.recorded, velocity));
    const sample = own && own.level > 0 ? own : base;
    const start = Math.max(at, ctx.currentTime);
    const end = start + Math.max(duration, 0.05);

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = playbackRate(recorded, pitch);

    // The sample carries the note's own decay; the gain only sets its loudness and the release.
    const gain = ctx.createGain();
    // As loud as the base layer would be at this velocity, whichever layer plays: only the tone differs.
    const level = velocityGain(velocity, set.recorded[set.base] ?? 0) * (base.level / sample.level);
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

    // The key comes up (unless it was up already): its knock, softer the longer it was held.
    const knock = this.decoded.get(set.release.get(pitch) ?? '');
    if (knock && held > 0) this.playOnce(knock, start + Math.min(held, end - start), releaseGain(velocity, held));
    // The damper lands and the sound stops: what is left of the strings' ring.
    const rings = velocity < set.resonance.split ? set.resonance.soft : set.resonance.loud;
    const from = nearestRecorded(set.resonance.pitches, pitch);
    const ring = this.decoded.get(rings.get(from) ?? '');
    // The top strings have no dampers: nothing to land.
    if (ring && Math.abs(pitch - from) <= 1) this.playOnce(ring, end, resonanceGain(velocity, end - start), playbackRate(from, pitch));
  }

  playPedal(at: number, down: boolean): void {
    if (!this.set || !this.on || this.currentStatus !== 'ready') return;
    // One of the takes, at random: the same noise every time would sound like a machine.
    const takes = down ? this.set.pedal.down : this.set.pedal.up;
    const take = this.decoded.get(takes[Math.floor(Math.random() * takes.length)] ?? '');
    if (take) this.playOnce(take, Math.max(at, this.ctx.currentTime), PEDAL_GAIN);
  }

  /** Plays a small sound through at a set loudness. */
  private playOnce(sample: Sample, at: number, level: number, rate = 1): void {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(this.output);
    const voice: Voice = { source, gain };
    this.voices.add(voice);
    source.start(at, sample.onset);
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
