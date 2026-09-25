import { noteEnd, type Note } from './note';

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export interface Score {
  readonly title: string;
  /** Sorted by start time. */
  readonly notes: readonly Note[];
  /** Start time of every bar in seconds, sorted, first one is 0. */
  readonly bars: readonly number[];
  readonly duration: number;
}

export function createScore(title: string, notes: readonly Note[], bars: readonly number[]): Score {
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const duration = sortedNotes.reduce((max, note) => Math.max(max, noteEnd(note)), 0);
  const sortedBars = bars.filter((bar) => bar < duration).sort((a, b) => a - b);
  if (sortedBars[0] !== 0) sortedBars.unshift(0);
  return { title, notes: sortedNotes, bars: sortedBars, duration };
}

export const EMPTY_SCORE: Score = createScore('', [], []);

/** Index of the last element in a sorted array that is <= value, or -1. */
function lastIndexAtOrBefore(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Zero-based index of the bar that contains `time`. */
export const barAt = (score: Score, time: number): number =>
  Math.max(0, lastIndexAtOrBefore(score.bars, time));

/** Time range covering bars `from..to` inclusive (zero-based). */
export function barRange(score: Score, from: number, to: number): TimeRange {
  const last = score.bars.length - 1;
  const first = Math.min(Math.max(0, Math.min(from, to)), last);
  const final = Math.min(Math.max(0, Math.max(from, to)), last);
  return { start: score.bars[first], end: score.bars[final + 1] ?? score.duration };
}

/** Index of the first note that starts at or after `time`. */
export function firstNoteAtOrAfter(score: Score, time: number): number {
  const { notes } = score;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].start < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
