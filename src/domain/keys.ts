import { noteEnd, type Note } from './note';
import type { Score } from './score';

/*
 * The keys as a pianist's fingers move on them. A note written to last until the same note is
 * struck again cannot be held that long: the finger leaves the key a moment before, to strike it
 * anew. Shown that way on the keyboard, a repeated note is seen to be repeated: its key goes out
 * between the strikes, instead of staying lit all the way through. (This is what the finger does,
 * not what is written or what sounds: the note is as long as written, and its falling tile too.)
 */

/** A finger is off its key for this long before striking it again, in seconds… */
const LIFT_SECONDS = 0.08;
/** …but for no more than this share of the time between the two strikes (fast repeats keep most of their length). */
const LIFT_SHARE = 0.3;

/**
 * When each key comes up, in seconds (same order as `notes`, which are in the order of their
 * starts): the note's end, or a moment before the next strike of the same key when the note
 * would reach it.
 */
export function keyReleases(notes: readonly Note[]): number[] {
  // For each key, walking back from the end: the strike reached so far, and the one after it
  // (two notes struck together on one key, a unison of both hands, are one strike).
  const strikes = new Map<number, { at: number; after: number | undefined }>();
  const releases = new Array<number>(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]!;
    const reached = strikes.get(note.pitch);
    const together = reached !== undefined && Math.abs(reached.at - note.start) < 1e-9;
    const next = together ? reached.after : reached?.at;
    const end = noteEnd(note);
    releases[i] = next === undefined ? end : Math.min(end, next - Math.min(LIFT_SECONDS, (next - note.start) * LIFT_SHARE));
    if (!together) strikes.set(note.pitch, { at: note.start, after: reached?.at });
  }
  return releases;
}

const cache = new WeakMap<Score, readonly number[]>();

/** When each key of a score comes up (see keyReleases), by the index of its note. */
export function keyReleasesOf(score: Score): readonly number[] {
  let releases = cache.get(score);
  if (!releases) {
    releases = keyReleases(score.notes);
    cache.set(score, releases);
  }
  return releases;
}
