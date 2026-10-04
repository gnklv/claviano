import { engravePedal } from '../../domain/notation/pedalEngraving';
import type { Score } from '../../domain/score';
import { beatPosition } from './staffLayout';

export type * from '../../domain/notation/pedalEngraving';

/** The score's pedal marks as printed (see engravePedal), with horizontal places along the tape. */
export function layoutPedal(score: Score): ReturnType<typeof engravePedal> {
  return engravePedal(score, (bar, beat) => beatPosition(score, bar, beat));
}
