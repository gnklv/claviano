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
  readonly layers: readonly PianoLayer[];
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

/**
 * How loud a key struck at `velocity` (0–1) sounds, as a gain on a layer recorded at `recorded`
 * (0–1): 1 at the recorded velocity, about ten times quieter for the softest notes and three
 * times louder for the hardest. The curve is steeper than linear, as a piano's is.
 */
export function velocityGain(velocity: number, recorded: number): number {
  return (Math.max(0.05, velocity) / recorded) ** 1.6;
}
