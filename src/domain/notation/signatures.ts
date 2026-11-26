import { barAtBeat, keySignatureAt, type Score, type TimeSignature } from '../score';
import type { Clef } from './written';
import { SAME_MOMENT } from '../moment';

/*
 * Key signatures on the staff, and where the key and the metre change along the page.
 *
 * Staff steps are half spaces from the top line down (see staffPosition.ts).
 */

/*
 * Key signature accidentals always go in the same order and at the same places:
 * sharps Fa Do Sol Re La Mi Si, flats Si Mi La Re Sol Do Fa. On the treble staff the first sharp
 * (Fa) sits on the top line; on the bass staff everything is two steps lower (a third down).
 */
const SHARP_STEPS_TREBLE = [0, 3, -1, 2, 5, 1, 4];
const FLAT_STEPS_TREBLE = [4, 1, 5, 2, 6, 3, 7];
const BASS_OFFSET = 2;

/** Staff steps of the key signature's accidentals, in the order they are written. */
export function keySignatureSteps(fifths: number, clef: Clef): number[] {
  const steps = fifths >= 0 ? SHARP_STEPS_TREBLE : FLAT_STEPS_TREBLE;
  const offset = clef === 'bass' ? BASS_OFFSET : 0;
  return steps.slice(0, Math.min(7, Math.abs(fifths))).map((step) => step + offset);
}

/**
 * Staff steps of the naturals printed at a key change: they cancel the old key's accidentals that
 * the new key no longer has. From three flats to two sharps all three flats are cancelled; from
 * three flats to one only the last two; from one flat to two, none.
 */
export function cancelledSteps(from: number, to: number, clef: Clef): number[] {
  const kept = Math.sign(from) === Math.sign(to) ? Math.min(Math.abs(from), Math.abs(to)) : 0;
  return keySignatureSteps(from, clef).slice(kept);
}

/** What changes at the start of a printed bar: the key (from, to) and/or the time signature. */
export type KeyChange = { readonly from: number; readonly to: number };

export interface SignatureChange {
  readonly bar: number;
  readonly keys: readonly [KeyChange | null, KeyChange | null];
  readonly time: TimeSignature | null;
}

/**
 * The key and time changes along the page, by printed bar. The opening signatures are not
 * changes; a change inside a bar (rare) is shown at the start of that bar.
 */
export function signatureChanges(score: Score): SignatureChange[] {
  const byBar = new Map<number, { keys: [KeyChange | null, KeyChange | null]; time: TimeSignature | null }>();
  const at = (beat: number) => {
    const bar = barAtBeat(score, beat);
    const entry = byBar.get(bar) ?? { keys: [null, null] as [KeyChange | null, KeyChange | null], time: null };
    byBar.set(bar, entry);
    return entry;
  };
  const previous = [keySignatureAt(score, 0, 1).fifths, keySignatureAt(score, 0, 2).fifths];
  for (const beat of new Set(score.notation.keySignatures.map(key => key.beat))) {
    if (beat <= SAME_MOMENT) continue;
    for (const index of [0, 1] as const) {
      const to = keySignatureAt(score, beat, index + 1).fifths;
      if (to === previous[index]) continue;
      const entry = at(beat);
      const from = entry.keys[index]?.from ?? previous[index]!;
      entry.keys[index] = from === to ? null : { from, to };
      previous[index] = to;
    }
  }
  score.notation.timeSignatures.forEach((time, i) => {
    if (i > 0 && time.beat > SAME_MOMENT) at(time.beat).time = time;
  });
  return [...byBar].filter(([, entry]) => entry.time || entry.keys.some(Boolean)).sort((a, b) => a[0] - b[0]).map(([bar, change]) => ({ bar, ...change }));
}
