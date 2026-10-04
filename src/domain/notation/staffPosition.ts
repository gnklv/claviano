import type { Hand } from '../note';
import type { SpelledPitch } from './spelling';
import type { Clef } from './written';

/*
 * Where notes sit on a staff. Vertical positions are counted in "steps": half a staff space, from
 * the top line downwards. 0 is the top line, 1 the space below it, 2 the second line … 8 the
 * bottom line; negative steps are above the staff.
 */

/** The staff's top line as a diatonic index (octave × 7 + letter): Fa5 on treble, La3 on bass. */
const TOP_LINE: Record<Clef, number> = { treble: 5 * 7 + 3, bass: 3 * 7 + 5 };
/** The middle and the bottom line (the top line is step 0). */
export const MIDDLE_LINE_STEP = 4;
export const BOTTOM_LINE_STEP = 8;

/** Where a pitch sits on a staff with `clef`, in staff steps. */
export const staffStep = (pitch: SpelledPitch, clef: Clef): number => TOP_LINE[clef] - (pitch.octave * 7 + pitch.letter);

/** How many ledger lines a note at `step` needs. */
export const ledgerLineCount = (step: number): number =>
  step < 0 ? Math.floor(-step / 2) : step > BOTTOM_LINE_STEP ? Math.floor((step - BOTTOM_LINE_STEP) / 2) : 0;

/** More ledger lines than this, and a note may move to the other staff. */
const MAX_LEDGER_LINES = 2;

/** Each hand's home staff. */
export const HOME_STAFF: Record<Hand, Clef> = { right: 'treble', left: 'bass' };

/**
 * Right hand on the treble staff, left hand on the bass staff — unless the note is far outside
 * its staff (more than two ledger lines) and fits the other one better. Then it is written on the
 * other staff, as scores do when hands cross; a hand mark and its stem direction tell which hand
 * plays it.
 */
export function staffFor(hand: Hand, pitch: SpelledPitch): Clef {
  const own = HOME_STAFF[hand];
  const other: Clef = own === 'treble' ? 'bass' : 'treble';
  const ownLedgers = ledgerLineCount(staffStep(pitch, own));
  return ownLedgers > MAX_LEDGER_LINES && ledgerLineCount(staffStep(pitch, other)) < ownLedgers ? other : own;
}
