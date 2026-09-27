/*
 * Which note to draw for a duration: 2 quarters is a half note, 1.5 a dotted quarter.
 */

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirtySecond';

export interface WrittenDuration {
  readonly value: NoteValue;
  /** 0 or 1: a dot adds half the value. */
  readonly dots: 0 | 1;
}

const BEATS: Record<NoteValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtySecond: 0.125,
};

/** Every duration level 1 can write, longest first. */
const WRITABLE: (WrittenDuration & { beats: number })[] = (Object.keys(BEATS) as NoteValue[])
  .flatMap((value) => [
    { value, dots: 1 as const, beats: BEATS[value] * 1.5 },
    { value, dots: 0 as const, beats: BEATS[value] },
  ])
  .sort((a, b) => b.beats - a.beats);

/**
 * The longest single note (plain or dotted) that fits in `beats`. Lengths that need two tied
 * notes, like 1.25, get the nearest shorter one for now; anything shorter than a thirty-second
 * is a thirty-second.
 */
export function writtenDuration(beats: number): WrittenDuration {
  const fit = WRITABLE.find((candidate) => candidate.beats <= beats + 1e-9) ?? WRITABLE[WRITABLE.length - 1];
  return { value: fit.value, dots: fit.dots };
}

const FLAGS: Record<NoteValue, number> = { whole: 0, half: 0, quarter: 0, eighth: 1, sixteenth: 2, thirtySecond: 3 };

/** How many flags a note value has (eighth 1, sixteenth 2, thirty-second 3). */
export const flagCount = (value: NoteValue): number => FLAGS[value];
