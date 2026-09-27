import { barAt, barLength, barLengthInBeats, timeSignatureAt, type Score } from '../../domain/score';

/** Where each bar starts on the tape and how wide it is, in "bar units" (a full bar is 1 wide). */
export interface TapeBars {
  readonly starts: readonly number[];
  readonly widths: readonly number[];
  /** Where the last bar ends. */
  readonly end: number;
}

const tapeBarsCache = new WeakMap<Score, TapeBars>();

/**
 * Full bars are equally wide, as in printed music, whatever their duration in seconds.
 * An incomplete bar (a pickup, or the shortened last bar that often goes with it) is as wide
 * as the share of the time signature it fills, so its notes are not stretched apart.
 */
export function tapeBars(score: Score): TapeBars {
  const cached = tapeBarsCache.get(score);
  if (cached) return cached;
  const starts: number[] = [];
  const widths: number[] = [];
  let position = 0;
  score.bars.forEach((_, index) => {
    const nominal = barLengthInBeats(timeSignatureAt(score, score.barBeats[index]));
    const width = Math.min(1, Math.max(MIN_BAR_SHARE, barLength(score, index) / nominal));
    starts.push(position);
    widths.push(width);
    position += width;
  });
  const result = { starts, widths, end: position };
  tapeBarsCache.set(score, result);
  return result;
}

/** A bar never gets narrower than this share, so a very short bar stays readable. */
const MIN_BAR_SHARE = 0.25;

/**
 * Where `time` falls on the tape, in bar units: 0 is the start of the first bar, 2.5 the middle
 * of the third one (when all bars are full). Bars can last different times (tempo or metre
 * changes), so the tape's speed varies per bar, but bar lines stay evenly spaced.
 */
export function barPosition(score: Score, time: number): number {
  const index = barAt(score, time);
  const start = score.bars[index];
  const end = score.bars[index + 1] ?? score.duration;
  const fraction = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
  const bars = tapeBars(score);
  return bars.starts[index] + fraction * bars.widths[index];
}

/** Where a musical position (bar index and beat) falls on the tape, in bar units. */
export function beatPosition(score: Score, bar: number, beat: number): number {
  const bars = tapeBars(score);
  return bars.starts[bar] + ((beat - score.barBeats[bar]) / barLength(score, bar)) * bars.widths[bar];
}

export type Clef = 'treble' | 'bass';

/*
 * Vertical positions on a staff are counted in "steps": half a staff space, from the top line
 * downwards. 0 is the top line, 1 the space below it, 2 the second line … 8 the bottom line;
 * negative steps are above the staff.
 *
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
