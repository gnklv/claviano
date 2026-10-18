import type { Playback } from './Playback';

/** The tempos offered for practising, as shares of the piece's own: from a quarter of it to half as fast again, in steps of 5%. */
export const PRACTICE_TEMPO = { min: 0.25, max: 1.5, step: 0.05 } as const;

/**
 * Makes the tempo `steps` steps faster (slower when negative), within what is offered. From a tempo
 * between two steps the first step is to the nearest one that way: from 72%, 75% or 70%.
 */
/** A tempo nearer a step than this, in steps, is on it (floating point leaves 0.7 / 0.05 a little short of 14). */
const ON_A_STEP = 1e-6;

export function stepTempo(playback: Playback, steps: number): void {
  const { min, max, step } = PRACTICE_TEMPO;
  const at = playback.tempo / step;
  const stepped = ((steps > 0 ? Math.floor(at + ON_A_STEP) : Math.ceil(at - ON_A_STEP)) + steps) * step;
  // (Rounded: 14 × 0.05 is not 0.7 in floating point.)
  playback.setTempo(Math.round(Math.min(Math.max(stepped, min), max) * 100) / 100);
}
