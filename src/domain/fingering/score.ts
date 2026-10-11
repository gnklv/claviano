import type { Hand } from '../note';
import type { Score } from '../score';
import type { Finger } from './hand';
import { fingerPassage } from './passage';
import type { Key } from './scales';

/** The hand is free to move when nothing of its own sounds for this long, in quarter notes: a rest, a breath. */
const REST = 1;
/** Notes this close in time, in quarter notes, are struck together. */
const TOGETHER = 1e-6;

/** The key a piece is in at its start, from its key signature: so many sharps (or, below zero, flats). */
function keyOf(score: Score): Key | undefined {
  const signature = score.notation.keySignatures[0];
  if (!signature) return undefined;
  // Each sharp is a fifth up from Do; a minor key's tonic is a minor third under its major's.
  const major = (((signature.fifths * 7) % 12) + 12) % 12;
  return { tonic: signature.minor ? (major + 9) % 12 : major, minor: signature.minor };
}

/**
 * Fingers for a whole piece: for each of its notes (as they stand in `score.notes`), the finger to
 * play it with; null for a note that falls in a chord no one hand takes. Each hand is fingered by
 * itself, its notes taken as they are struck: together as chords, one after another as a line,
 * afresh after a rest.
 */
export function fingerScore(score: Score): (Finger | null)[] {
  const fingers: (Finger | null)[] = score.notes.map(() => null);
  const key = keyOf(score);
  for (const hand of ['right', 'left'] as Hand[]) {
    // The hand's notes, by when they are struck.
    const own = score.notes.map((note, index) => ({ note, index })).filter(({ note }) => note.hand === hand);
    const moments: { beat: number; end: number; notes: typeof own }[] = [];
    for (const entry of own) {
      const last = moments.at(-1);
      if (last && Math.abs(entry.note.beat - last.beat) < TOGETHER) {
        last.notes.push(entry);
        last.end = Math.max(last.end, entry.note.beat + entry.note.beats);
      } else {
        moments.push({ beat: entry.note.beat, end: entry.note.beat + entry.note.beats, notes: [entry] });
      }
    }
    for (const moment of moments) moment.notes.sort((a, b) => a.note.pitch - b.note.pitch);

    // Free where the hand has had a rest: nothing of its own sounding for a while before.
    let sounding = -Infinity;
    const free = moments.map((moment) => {
      const rested = moment.beat - sounding >= REST - TOGETHER;
      sounding = Math.max(sounding, moment.end);
      return rested;
    });

    const found = fingerPassage(
      moments.map((moment) => moment.notes.map(({ note }) => note.pitch)),
      hand,
      { free, key },
    );
    moments.forEach((moment, i) => moment.notes.forEach(({ index }, at) => (fingers[index] = found[i]?.[at] ?? null)));
  }
  return fingers;
}
