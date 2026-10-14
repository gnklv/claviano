import { BOTTOM_LINE_STEP } from '../staffPosition';
import type { NotationLayout } from './types';

/*
 * How far the music of a piece reaches beyond its two staves: above the top line of the upper one
 * and below the bottom line of the lower one. A staff is sized so that all of it is seen, the
 * highest note of the piece and the lowest as much as the rest.
 */

/** A stem is about three and a half spaces long: seven steps. */
const STEM = 7;
/**
 * Beyond the outermost head there is room for what stands over or under the notes (an accent, a
 * bar number; a dynamic): three and a half spaces. Beyond the tip of a stem, or a sign set at a
 * step of its own: a space and a half.
 */
const BEYOND_A_HEAD = 7;
const BEYOND_A_TIP = 3;
/** Words and the tempo stand over everything else of the upper staff: a space more above. */
const WORDS = 2;
/**
 * The pedal's signs stand under everything else of the lower staff: two spaces and a half more
 * below. Dynamics pushed under the lower staff stand there too, over the pedal: a space and a half.
 * (Tuned on Golden Hour and the csárdás, whose lowest notes have both under them.)
 */
const PEDAL = 5;
const DYNAMICS = 3;

/**
 * In staff steps (half spaces): how much room the piece needs above the upper staff's top line,
 * and below the lower staff's bottom line, for all of it to be seen. Never less than nothing.
 * `has`: what else the piece has that stands outermost: words above, the pedal's signs and dynamics below.
 */
export function reachOf(layout: NotationLayout, has: { pedal?: boolean; words?: boolean; dynamics?: boolean } = {}): { above: number; below: number } {
  const over = has.words ? WORDS : 0;
  const under = (has.pedal ? PEDAL : 0) + (has.dynamics ? DYNAMICS : 0);
  let above = 0;
  let below = 0;
  /** `top` and `bottom`: the steps it reaches to on its staff, room beyond it counted in. */
  const reaches = (staff: 'treble' | 'bass', top: number, bottom: number) => {
    if (staff === 'treble') above = Math.max(above, -(top - over));
    else below = Math.max(below, bottom + under - BOTTOM_LINE_STEP);
  };
  for (const chord of layout.chords) {
    const top = chord.notes[0]?.step ?? 0;
    const bottom = chord.notes.at(-1)?.step ?? 0;
    reaches(chord.staff, top - BEYOND_A_HEAD, bottom + BEYOND_A_HEAD);
    if (chord.duration.value === 'whole') continue;
    if (chord.stemUp) reaches(chord.staff, top - STEM - BEYOND_A_TIP, bottom);
    else reaches(chord.staff, top, bottom + STEM + BEYOND_A_TIP);
  }
  for (const grace of layout.graces) {
    for (const slot of grace.slots) reaches(grace.staff, (slot.notes[0]?.step ?? 0) - STEM, (slot.notes.at(-1)?.step ?? 0) + BEYOND_A_TIP);
  }
  const staffOf = (chord: number) => layout.chords[chord]?.staff ?? 'treble';
  for (const sign of [...layout.marks, ...layout.ornaments, ...layout.fingerings]) {
    reaches(staffOf(sign.chord), sign.step - 2 * BEYOND_A_TIP, sign.step + 2 * BEYOND_A_TIP);
  }
  return { above, below };
}
