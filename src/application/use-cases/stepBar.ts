import { barAt } from '../../domain/score';
import type { Playback } from './Playback';

/** Moves playback to the start of the bar `delta` bars on from the one it is in (back when negative), within the piece. */
export function stepBar(playback: Playback, delta: number): void {
  const score = playback.score;
  if (!score) return;
  // (A moment past the position: standing exactly on a bar line is being in the bar it opens.)
  const target = Math.min(Math.max(barAt(score, playback.position + 0.01) + delta, 0), score.bars.length - 1);
  const start = score.bars[target];
  if (start !== undefined) playback.seek(start);
}
