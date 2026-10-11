import type { Hand } from '../note';
import type { WrittenNote } from '../notation/written';
import type { Score } from '../score';
import type { Finger } from './hand';
import { fingerPassage, samePosition } from './passage';
import type { Key } from './scales';

/*
 * Fingering hints for a piece as it is written: where the notes give no finger, one worked out
 * from the hand (see passage.ts), to print beside the notes as an edition would.
 *
 * Fingers written in the notes stand, and the rest is fitted to them. And not every finger is
 * said: a good edition marks where the hand does something (begins, moves, turns the thumb under,
 * takes a chord), and leaves the rest to follow from it. So is it here:
 * - the first note after a rest;
 * - a note or a chord the hand has moved to (it does not lie under the position of the one before);
 * - a chord, the first time it comes in its place.
 * What has been said once is not said again where the same notes come the same way.
 */

/** The hand is free to move when nothing of its own sounds for this long, in quarter notes: a rest, a breath. */
const REST = 1;
/** Notes this close in time, in quarter notes, are struck together. */
const TOGETHER = 1e-6;

/** The key a piece is in at its start, from its key signature. */
function keyOf(score: Score): Key | undefined {
  const signature = score.notation.keySignatures[0];
  if (!signature) return undefined;
  // Each sharp is a fifth up from Do; a minor key's tonic is a minor third under its major's.
  const major = (((signature.fifths * 7) % 12) + 12) % 12;
  return { tonic: signature.minor ? (major + 9) % 12 : major, minor: signature.minor };
}

/** The finger a note is printed with, if it is one finger ("3"; not "2-1", a change on the key). */
const printed = (note: WrittenNote): Finger | null => (note.fingering && /^[1-5]$/.test(note.fingering.text) ? (Number(note.fingering.text) as Finger) : null);

/** A finger worked out for a written note, and whether it is worth saying. */
export interface FingerHint {
  readonly finger: Finger;
  readonly said: boolean;
}

/**
 * A finger for each written note of a piece (as they stand in `score.notation.notes`): null for a
 * note that has one printed, a note tied from the one before (it is not struck), and a note of a
 * chord no one hand takes.
 */
export function fingerHints(score: Score): (FingerHint | null)[] {
  const notes = score.notation.notes;
  const hints: (FingerHint | null)[] = notes.map(() => null);
  const key = keyOf(score);

  for (const hand of ['right', 'left'] as Hand[]) {
    // The hand's notes that are struck, by when: together as chords.
    const own = notes
      .map((note, index) => ({ note, index }))
      .filter(({ note }) => note.hand === hand && !note.tieStop)
      .sort((a, b) => a.note.beat - b.note.beat || a.note.sounding - b.note.sounding);
    const moments: { beat: number; end: number; notes: typeof own }[] = [];
    for (const entry of own) {
      const last = moments.at(-1);
      if (last && Math.abs(entry.note.beat - last.beat) < TOGETHER) {
        // (Two voices on one key are one key.)
        if (!last.notes.some((other) => other.note.sounding === entry.note.sounding)) last.notes.push(entry);
        last.end = Math.max(last.end, entry.note.beat + entry.note.beats);
      } else {
        moments.push({ beat: entry.note.beat, end: entry.note.beat + entry.note.beats, notes: [entry] });
      }
    }

    // Free where the hand has had a rest: nothing of its own sounding for a while before.
    let sounding = -Infinity;
    const free = moments.map((moment) => {
      const rested = moment.beat - sounding >= REST - TOGETHER;
      sounding = Math.max(sounding, moment.end);
      return rested;
    });

    const keys = moments.map((moment) => moment.notes.map(({ note }) => note.sounding));
    const fingers = fingerPassage(keys, hand, { free, key, given: moments.map((moment) => moment.notes.map(({ note }) => printed(note))) });

    /** What has been said already: the same keys, the same way, after the same keys. */
    const told = new Set<string>();
    moments.forEach((moment, i) => {
      const way = fingers[i] ?? [];
      if (way.length === 0) return;
      const before = i > 0 && !free[i] && (fingers[i - 1]?.length ?? 0) > 0 ? { keys: keys[i - 1]!, way: fingers[i - 1]! } : null;
      // Worth saying: the hand begins, or has moved here, or takes a chord.
      const moved = !before || !samePosition(before.keys, before.way, keys[i]!, way, hand);
      // (A chord struck again as it was says nothing new.)
      const again = before !== null && before.keys.join() === keys[i]!.join() && before.way.join() === way.join();
      const worth = !again && (moved || keys[i]!.length > 1);
      const context = `${before?.keys.join(',') ?? ''}|${keys[i]!.join(',')}|${way.join('')}`;
      const said = worth && !told.has(context);
      told.add(context);
      moment.notes.forEach(({ note, index }, at) => {
        if (!note.fingering) hints[index] = { finger: way[at]!, said };
      });
    });
  }
  return hints;
}

/**
 * The piece with its fingering hints written in: each note that has a hint worth saying gets it as
 * its fingering, marked as a hint (to be printed paler than what the notes themselves give).
 */
export function withFingerHints(score: Score): Score {
  const hints = fingerHints(score);
  const notes = score.notation.notes.map((note, index) => {
    const hint = hints[index];
    return hint?.said ? { ...note, fingering: { text: String(hint.finger), below: null, hint: true } } : note;
  });
  return { ...score, notation: { ...score.notation, notes } };
}
