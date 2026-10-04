/*
 * The piano sample set in public/piano (built by scripts/samples.ts) and the arithmetic of playing
 * it: only every third key is recorded, the others are played from the nearest recorded one,
 * a little faster or slower.
 */

import type { NoteToPrepare } from '../../application/ports/Instrument';

/** public/piano/manifest.json. */
export interface PianoManifest {
  readonly name: string;
  readonly author: string;
  readonly license: string;
  /** Changes when the set is rebuilt with other content; part of the samples' addresses, for caching. */
  readonly version: string;
  /** The loudness layers, softest first. */
  readonly layers: readonly PianoLayer[];
  /** The id of the layer to fetch first: the piano plays from it alone until the others are in. */
  readonly base: string;
  /** The small sounds of the instrument itself; fetched last. */
  readonly extras: PianoExtras;
}

interface PianoFile {
  readonly pitch: number;
  readonly file: string;
}

export interface PianoExtras {
  /** The knock of each key coming up. */
  readonly release: readonly PianoFile[];
  /** The strings' short ring as the damper lands, for softer and louder strikes (every third key). */
  readonly resonance: {
    /** Strikes softer than this MIDI velocity ring from `soft`. */
    readonly splitVelocity: number;
    readonly soft: readonly PianoFile[];
    readonly loud: readonly PianoFile[];
  };
  /** The sustain pedal's noise going down and coming up: a few takes of each, picked at random. */
  readonly pedal: { readonly down: readonly string[]; readonly up: readonly string[] };
}

/** One loudness the piano was recorded at. */
export interface PianoLayer {
  readonly id: string;
  /** The MIDI velocities (1–127) it was recorded for. */
  readonly velocity: readonly [number, number];
  /** Its recorded notes, lowest first. */
  readonly notes: readonly { readonly pitch: number; readonly file: string; readonly bytes: number }[];
}

/** The recorded pitch to play `pitch` from: the nearest one (the lower of two equally near). */
export function nearestRecorded(recorded: readonly number[], pitch: number): number {
  let best = recorded[0];
  for (const candidate of recorded) {
    if (Math.abs(candidate - pitch) < Math.abs(best - pitch)) best = candidate;
  }
  return best;
}

/** The middle of the keyboard, where most music is. */
const MIDDLE_PITCH = 60;

/**
 * The order to fetch the samples in: those the piece needs first, then the rest; each group from
 * the middle of the keyboard outwards, where notes are likeliest to be played next.
 */
export function loadOrder(recorded: readonly number[], needed: ReadonlySet<number>): number[] {
  const fromMiddle = (a: number, b: number) => Math.abs(a - MIDDLE_PITCH) - Math.abs(b - MIDDLE_PITCH) || a - b;
  return [
    ...recorded.filter((pitch) => needed.has(pitch)).sort(fromMiddle),
    ...recorded.filter((pitch) => !needed.has(pitch)).sort(fromMiddle),
  ];
}

/** The sample set as the player uses it: its files, by what each is for. */
export interface SampleSet {
  /** The loudness layers, softest first: their files by recorded pitch. */
  readonly layers: readonly ReadonlyMap<number, string>[];
  /** The velocity (0–1) each layer was recorded at. */
  readonly recorded: readonly number[];
  /** The layer the piano can play from alone, until a note's own layer is in. */
  readonly base: number;
  /** The recorded pitches, lowest first (the same in every layer). */
  readonly pitches: readonly number[];
  /** The knock of each key coming up, by key. */
  readonly release: ReadonlyMap<number, string>;
  /** The strings' ring as the damper lands: for strikes softer than `split` (0–1) and for the others, by recorded pitch. */
  readonly resonance: { readonly split: number; readonly pitches: readonly number[]; readonly soft: ReadonlyMap<number, string>; readonly loud: ReadonlyMap<number, string> };
  /** The pedal's noise going down and coming up: a few takes of each. */
  readonly pedal: { readonly down: readonly string[]; readonly up: readonly string[] };
  /** Every file of the set. */
  readonly files: readonly string[];
}

/** Reads a manifest into the set; the files' addresses carry the set's version, for caching. */
export function describeSet(manifest: PianoManifest): SampleSet {
  const versioned = (file: string) => `${file}?v=${manifest.version}`;
  const byPitch = (notes: readonly PianoFile[]) => new Map(notes.map((note) => [note.pitch, versioned(note.file)]));
  const base = Math.max(0, manifest.layers.findIndex((layer) => layer.id === manifest.base));
  const layers = manifest.layers.map((layer) => byPitch(layer.notes));
  const { release, resonance, pedal } = manifest.extras;
  const set = {
    layers,
    recorded: manifest.layers.map((layer) => (layer.velocity[0] + layer.velocity[1]) / 2 / 127),
    base,
    pitches: manifest.layers[base].notes.map((note) => note.pitch),
    release: byPitch(release),
    resonance: { split: resonance.splitVelocity / 127, pitches: resonance.soft.map((note) => note.pitch), soft: byPitch(resonance.soft), loud: byPitch(resonance.loud) },
    pedal: { down: pedal.down.map(versioned), up: pedal.up.map(versioned) },
  };
  return {
    ...set,
    files: [...layers.flatMap((layer) => [...layer.values()]), ...set.pedal.down, ...set.pedal.up, ...set.resonance.soft.values(), ...set.resonance.loud.values(), ...set.release.values()],
  };
}

/** After its key is released a note still fades for a moment: this much more of the sample is kept. */
const RELEASE_TAIL_SECONDS = 1;
/**
 * The base layer plays a note whose own layer is not decoded yet (just after a piece is opened),
 * or one struck otherwise than expected: for that, this much of it is always kept.
 */
const STAND_IN_SECONDS = 3;
/** Lengths to keep a sample at, in seconds: a note needing 2.3 s gets 3, so small changes of tempo do not ask for it again. */
const KEPT_LENGTHS = [1, 2, 3, 4, 6, 8];

/** The length to keep of a sample that must sound for `seconds`: the next of KEPT_LENGTHS, or all of it. */
export const keptLength = (seconds: number): number => KEPT_LENGTHS.find((length) => length >= seconds) ?? Infinity;

/** The small sounds (knocks, rings, the pedal) are barely heard: the first seconds of each are enough, and in mono. */
const SMALL_SOUND_SECONDS = 2;

/** What the notes need decoded. */
export interface SamplesWanted {
  /** The files, in the order to get them, with how many seconds of each to keep (Infinity: all of it). */
  readonly files: Map<string, number>;
  /** With these alone the piano can play: the base layer of the notes' pitches. */
  readonly required: Set<string>;
  /** Kept in mono: the small sounds. */
  readonly mono: Set<string>;
}

/**
 * The samples to have decoded for these notes, in the order to get them: the base layer of the
 * notes' pitches, each note's own layer, then the pedal's noise, the strings' rings and the keys'
 * knocks. Decoded sound takes a lot of memory (a 12-second stereo sample is 4.6 MB): only what the
 * notes need is kept, and of each sample no more than the longest note played from it sounds.
 */
export function samplesWanted(set: SampleSet, notes: readonly NoteToPrepare[]): SamplesWanted {
  const pitches = new Set<number>();
  const lengths = new Map<string, number>(); // file of a note's own layer → seconds of it needed
  const rings = new Set<string>();
  const knocks = new Set<string>();
  for (const note of notes) {
    const recorded = nearestRecorded(set.pitches, note.pitch);
    pitches.add(recorded);
    // A sample played faster is used up faster.
    const seconds = note.seconds * playbackRate(recorded, note.pitch) + RELEASE_TAIL_SECONDS;
    const own = set.layers[layerFor(set.recorded, note.velocity)].get(recorded)!;
    lengths.set(own, Math.max(lengths.get(own) ?? 0, seconds));
    const knock = set.release.get(note.pitch);
    if (knock) knocks.add(knock);
    const from = nearestRecorded(set.resonance.pitches, note.pitch);
    const ring = (note.velocity < set.resonance.split ? set.resonance.soft : set.resonance.loud).get(from);
    if (ring && Math.abs(note.pitch - from) <= 1) rings.add(ring);
  }

  const files = new Map<string, number>();
  const required = new Set<string>();
  const inOrder = loadOrder(set.pitches, pitches).slice(0, pitches.size);
  for (const pitch of inOrder) {
    // The base layer: as long as its own notes need, and at least enough to stand in for another layer.
    const file = set.layers[set.base].get(pitch)!;
    files.set(file, keptLength(Math.max(lengths.get(file) ?? 0, STAND_IN_SECONDS)));
    required.add(file);
  }
  for (const pitch of inOrder) {
    for (const layer of set.layers) {
      const file = layer.get(pitch)!;
      if (lengths.has(file) && !files.has(file)) files.set(file, keptLength(lengths.get(file)!));
    }
  }
  const small = notes.length > 0 ? [...set.pedal.down, ...set.pedal.up, ...rings, ...knocks] : [];
  for (const file of small) files.set(file, SMALL_SOUND_SECONDS);
  return { files, required, mono: new Set(small) };
}

/** The layer to play a key struck at `velocity` (0–1) from: the one recorded nearest to it. */
export function layerFor(recordedVelocities: readonly number[], velocity: number): number {
  let best = 0;
  recordedVelocities.forEach((recorded, layer) => {
    if (Math.abs(recorded - velocity) < Math.abs(recordedVelocities[best] - velocity)) best = layer;
  });
  return best;
}

/** How much faster to play a sample recorded at `recorded` for it to sound at `pitch`. */
export const playbackRate = (recorded: number, pitch: number): number => 2 ** ((pitch - recorded) / 12);

/** Quieter than this is still the silence before the note (about −50 dB). */
const ONSET_THRESHOLD = 0.003;
/** Start this much before the first loud sample, so the very start of the attack is kept. */
const ONSET_LEAD_SECONDS = 0.002;

/**
 * Where the sound starts in a decoded sample, in seconds. Recordings begin with a few milliseconds
 * of silence, and MP3 decoders add some more (how much depends on the browser); skipping it puts
 * the hammer strike exactly on the beat.
 */
export function onsetSeconds(channels: readonly Float32Array[], sampleRate: number): number {
  const length = channels[0]?.length ?? 0;
  for (let i = 0; i < length; i++) {
    if (channels.some((channel) => Math.abs(channel[i]) > ONSET_THRESHOLD)) {
      return Math.max(0, i / sampleRate - ONSET_LEAD_SECONDS);
    }
  }
  return 0;
}

/** The strike and the start of the ring: what a sample's loudness is judged by. */
const LEVEL_SECONDS = 0.6;

/**
 * How loud a sample is (the RMS of its first LEVEL_SECONDS from `onset`). A louder layer's samples
 * are louder by themselves; knowing by how much, a note keeps its loudness whichever layer plays it.
 */
export function sampleLevel(channels: readonly Float32Array[], sampleRate: number, onset: number): number {
  const from = Math.floor(onset * sampleRate);
  const to = Math.min(channels[0]?.length ?? 0, from + Math.floor(LEVEL_SECONDS * sampleRate));
  if (to <= from) return 0;
  let sum = 0;
  for (const channel of channels) {
    for (let i = from; i < to; i++) sum += channel[i] * channel[i];
  }
  return Math.sqrt(sum / (channels.length * (to - from)));
}

/**
 * How loud a key struck at `velocity` (0–1) sounds, as a gain on the base layer, recorded at
 * `recorded` (0–1): 1 at the recorded velocity, about ten times quieter for the softest notes and three
 * times louder for the hardest. The curve is steeper than linear, as a piano's is.
 */
export function velocityGain(velocity: number, recorded: number): number {
  return (Math.max(0.05, velocity) / recorded) ** 1.6;
}

/*
 * How loud the instrument's small sounds are, in dB, as the original's own settings (.sfz) have
 * them: barely there, as on a real piano. Our notes play about 7 dB louder than the .sfz plays
 * them at a medium strike, so these are raised by as much to keep the proportion.
 */
const OUR_LEVEL_DB = 7;
const RELEASE_DB = -37 + OUR_LEVEL_DB;
/** The knock is softer by this many dB for each second the key was held. */
const RELEASE_DECAY_DB = 2;
const RESONANCE_DB = -4 + OUR_LEVEL_DB;
/** The ring is softer by this many dB for each second the note has sounded: less of it is left. */
const RESONANCE_DECAY_DB = 7;
const PEDAL_DB = -20 + OUR_LEVEL_DB;

const fromDb = (db: number): number => 10 ** (db / 20);

/** The gain of a key's knock as it comes up, struck at `velocity` (0–1) and held for `seconds`. */
export function releaseGain(velocity: number, seconds: number): number {
  return fromDb(RELEASE_DB - RELEASE_DECAY_DB * seconds) * (0.2 + 0.8 * velocity * velocity);
}

/** The gain of the strings' ring as the damper lands on a note struck at `velocity`, `seconds` after the strike. */
export function resonanceGain(velocity: number, seconds: number): number {
  return fromDb(RESONANCE_DB - RESONANCE_DECAY_DB * seconds) * (0.1 + 0.9 * velocity * velocity);
}

/** The gain of the pedal's noise. */
export const PEDAL_GAIN = fromDb(PEDAL_DB);
