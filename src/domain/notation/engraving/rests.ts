import { barAtBeat, barLength, writtenBarStart, type Score } from '../../score';
import { MIDDLE_LINE_STEP, staffStep } from '../staffPosition';
import type { WrittenNote, WrittenRest } from '../written';
import type { StaffRest } from './types';

/* Rests: where each hangs or sits on the staff, and how they make way for a second voice. */

/** Rest positions by the usual rules; see restStep. */
export const WHOLE_REST_STEP = 2; // hangs from the fourth line
const OTHER_REST_STEP = MIDDLE_LINE_STEP; // centred on the middle line
/** In a bar with two voices on one staff, rests move this far out of the way (two spaces). */
const VOICE_REST_SHIFT = 4;

/**
 * Where rests go. A whole-bar rest sits in the middle of its bar. Vertically: where the engraver
 * put it if the file says; otherwise a whole rest hangs from the fourth line and others centre on
 * the middle line, moved up for the upper voice and down for the lower one when two voices share
 * the staff in that bar.
 */
export function layoutRests(score: Score, rests: readonly WrittenRest[], written: readonly WrittenNote[]): StaffRest[] {
  const voicesInBar = new Map<string, Set<string>>();
  const note = (staff: number, beat: number, voice: string) => {
    const key = `${staff}|${barAtBeat(score, beat)}`;
    voicesInBar.set(key, (voicesInBar.get(key) ?? new Set<string>()).add(voice));
  };
  for (const n of written) note(n.staff, n.beat, n.voice);
  for (const r of rests) note(r.staff, r.beat, r.voice);

  return rests.map((rest): StaffRest => {
    const bar = barAtBeat(score, rest.beat);
    const duration = rest.measure ? { value: 'whole' as const, dots: 0 as const } : rest.duration;
    let step: number;
    if (rest.displayPitch) {
      step = staffStep({ ...rest.displayPitch, alteration: 0 }, rest.clef);
    } else {
      step = duration.value === 'whole' ? WHOLE_REST_STEP : OTHER_REST_STEP;
      const voices = [...(voicesInBar.get(`${rest.staff}|${bar}`) ?? [])].sort((a, b) => Number(a) - Number(b));
      if (voices.length > 1) step += voices.indexOf(rest.voice) === 0 ? -VOICE_REST_SHIFT : VOICE_REST_SHIFT;
    }
    return {
      staff: rest.staff >= 2 ? 'bass' : 'treble',
      // A whole-bar rest stands in the middle of its bar.
      beat: rest.measure ? writtenBarStart(score, bar) + barLength(score, bar) / 2 : rest.beat,
      step,
      duration,
    };
  });
}
