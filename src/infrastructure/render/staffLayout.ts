import { barLength, barLengthInBeats, timeSignatureAt, writtenPositionAt, type Score } from '../../domain/score';

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
  score.notation.bars.forEach(({ start }, index) => {
    const nominal = barLengthInBeats(timeSignatureAt(score, start));
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
 * The tape shows printed bars, so with repeats the position goes back.
 */
export function barPosition(score: Score, time: number): number {
  // Played bars map to printed ones: on a repeat the position jumps back along the tape.
  const { bar, fraction } = writtenPositionAt(score, time);
  const bars = tapeBars(score);
  return bars.starts[bar] + fraction * bars.widths[bar];
}

/** Where a musical position (bar index and beat) falls on the tape, in bar units. */
export function beatPosition(score: Score, bar: number, beat: number): number {
  const bars = tapeBars(score);
  return bars.starts[bar] + ((beat - score.notation.bars[bar].start) / barLength(score, bar)) * bars.widths[bar];
}

/** The beat at `x` on the tape (bar units) within printed bar `bar`, the inverse of beatPosition. */
export function beatAtPosition(score: Score, bar: number, x: number): number {
  const bars = tapeBars(score);
  const fraction = Math.min(1, Math.max(0, (x - bars.starts[bar]) / bars.widths[bar]));
  return score.notation.bars[bar].start + fraction * barLength(score, bar);
}

export type { Clef } from '../../domain/notation/written';
