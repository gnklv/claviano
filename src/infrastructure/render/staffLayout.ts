import { barAt, type Score } from '../../domain/score';

/**
 * Where `time` falls on a tape where every bar has the same width, in bar units:
 * 0 is the start of the first bar, 2.5 is the middle of the third one.
 * Bars can last different times (tempo or metre changes), so the tape's speed varies per bar,
 * but bar lines stay evenly spaced, as in printed music.
 */
export function barPosition(score: Score, time: number): number {
  const index = barAt(score, time);
  const start = score.bars[index];
  const end = score.bars[index + 1] ?? score.duration;
  const fraction = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
  return index + fraction;
}
