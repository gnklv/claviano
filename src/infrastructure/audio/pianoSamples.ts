/*
 * The piano sample set in public/piano (built by scripts/samples.ts) and the arithmetic of playing
 * it: only every third key is recorded, the others are played from the nearest recorded one,
 * a little faster or slower.
 */

/** public/piano/manifest.json. */
export interface PianoManifest {
  readonly name: string;
  readonly author: string;
  readonly license: string;
  /** The loudness layers, softest first. */
  readonly layers: readonly PianoLayer[];
  /** The id of the layer to fetch first: the piano plays from it alone until the others are in. */
  readonly base: string;
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

/** The recorded pitches a piece with these `pitches` is played from. */
export function neededRecorded(recorded: readonly number[], pitches: Iterable<number>): Set<number> {
  const needed = new Set<number>();
  for (const pitch of pitches) needed.add(nearestRecorded(recorded, pitch));
  return needed;
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

/**
 * The order to fetch all the layers' samples in, as [layer, pitch]: what the piece needs from the
 * base layer (then the piano can play), the same notes of the other layers (then it plays them in
 * full colour), and after that the rest of the keyboard, the base layer first.
 */
export function fetchOrder(recorded: readonly number[], needed: ReadonlySet<number>, layers: number, base: number): [number, number][] {
  const order = loadOrder(recorded, needed);
  const count = recorded.filter((pitch) => needed.has(pitch)).length;
  const others = Array.from({ length: layers }, (_, layer) => layer).filter((layer) => layer !== base);
  const of = (pitches: number[]): [number, number][] => [
    ...pitches.map((pitch): [number, number] => [base, pitch]),
    ...others.flatMap((layer) => pitches.map((pitch): [number, number] => [layer, pitch])),
  ];
  return [...of(order.slice(0, count)), ...of(order.slice(count))];
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
