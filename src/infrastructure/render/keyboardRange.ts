import { HIGHEST_KEY, LOWEST_KEY, isBlackKey } from '../../domain/pitch';
import type { Score } from '../../domain/score';

/** A stretch of the piano keyboard, MIDI numbers, both ends included. */
export interface KeyRange {
  readonly low: number;
  readonly high: number;
}

const OCTAVE = 12;
/** A narrower keyboard looks like a stub. */
const MIN_OCTAVES = 2;
/** Wider white keys look odd on big screens; beyond this, more of the keyboard is shown. */
export const MAX_WHITE_KEY_PX = 40;
/** Before a score is loaded: three octaves around middle Do (C3..C6). */
const DEFAULT_RANGE: KeyRange = { low: 48, high: 84 };

export function whiteKeyCount({ low, high }: KeyRange): number {
  let count = 0;
  for (let pitch = low; pitch <= high; pitch++) if (!isBlackKey(pitch)) count++;
  return count;
}

/**
 * The part of the keyboard to draw: from the Do at or below the lowest note of the piece
 * to the Do at or above the highest one, as real keyboards start and end on Do.
 * Then it grows an octave at a time, alternating sides, while it is shorter than two octaves
 * or while its white keys would be wider than `maxKeyWidthPx`, but never beyond 88 keys.
 * The caller lowers `maxKeyWidthPx` when the keyboard is short, so keys don't turn into squares.
 */
export function keyboardRange(
  score: Score | null,
  widthPx: number,
  maxKeyWidthPx: number = MAX_WHITE_KEY_PX,
): KeyRange {
  let low: number;
  let high: number;
  if (!score || score.notes.length === 0) {
    ({ low, high } = DEFAULT_RANGE);
  } else {
    const pitches = score.notes.map((note) => note.pitch);
    low = Math.floor(Math.min(...pitches) / OCTAVE) * OCTAVE;
    high = Math.ceil(Math.max(...pitches) / OCTAVE) * OCTAVE;
  }
  low = Math.max(LOWEST_KEY, low);
  high = Math.min(HIGHEST_KEY, high);

  const tooNarrow = () => high - low < MIN_OCTAVES * OCTAVE;
  const keysTooWide = () => widthPx / whiteKeyCount({ low, high }) > maxKeyWidthPx;
  const canGrow = () => low > LOWEST_KEY || high < HIGHEST_KEY;

  let growDown = true;
  while ((tooNarrow() || keysTooWide()) && canGrow()) {
    if ((growDown && low > LOWEST_KEY) || high >= HIGHEST_KEY) low = Math.max(LOWEST_KEY, low - OCTAVE);
    else high = Math.min(HIGHEST_KEY, high + OCTAVE);
    growDown = !growDown;
  }
  return { low, high };
}
