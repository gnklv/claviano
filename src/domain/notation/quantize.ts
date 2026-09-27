/*
 * MIDI from a live performance is never exactly on the beat: an eighth may last 0.47 quarters.
 * Notation needs clean values, so starts and ends are snapped to a grid.
 */

/** A thirty-second note, in quarter notes: the finest value we write. */
export const THIRTY_SECOND = 0.125;

export interface QuantizedTime {
  readonly beat: number;
  readonly beats: number;
}

const snap = (value: number, grid: number) => Math.round(value / grid) * grid;

/** Snaps start and end to the grid; a note never becomes shorter than one grid step. */
export function quantize(beat: number, beats: number, grid = THIRTY_SECOND): QuantizedTime {
  const start = snap(beat, grid);
  const end = snap(beat + beats, grid);
  return { beat: start, beats: Math.max(grid, end - start) };
}
