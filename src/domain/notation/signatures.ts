import { barAtBeat, type Score, type TimeSignature } from '../score';
import type { Clef } from './written';

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
export interface SignatureChange {
  readonly bar: number;
  readonly key: { readonly from: number; readonly to: number } | null;
  readonly time: TimeSignature | null;
}

/**
 * The key and time changes along the page, by printed bar. The opening signatures are not
 * changes; a change inside a bar (rare) is shown at the start of that bar.
 */
export function signatureChanges(score: Score): SignatureChange[] {
  const byBar = new Map<number, { key: SignatureChange['key']; time: TimeSignature | null }>();
  const at = (beat: number) => {
    const bar = barAtBeat(score, beat);
    const entry = byBar.get(bar) ?? { key: null, time: null };
    byBar.set(bar, entry);
    return entry;
  };
  score.notation.keySignatures.forEach((key, i) => {
    if (i > 0 && key.beat > 1e-9) at(key.beat).key = { from: score.notation.keySignatures[i - 1].fifths, to: key.fifths };
  });
  score.notation.timeSignatures.forEach((time, i) => {
    if (i > 0 && time.beat > 1e-9) at(time.beat).time = time;
  });
  return [...byBar].sort((a, b) => a[0] - b[0]).map(([bar, change]) => ({ bar, ...change }));
}
