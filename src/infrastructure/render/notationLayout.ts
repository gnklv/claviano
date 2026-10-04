import { engrave, type NotationLayout } from '../../domain/notation/engraving';
import type { Score } from '../../domain/score';
import { beatPosition } from './staffLayout';

/*
 * What stands where on the staves is the domain's business (see engraving.ts); here it is asked
 * for the tape: horizontal places in bar units, where 2.5 is the middle of the third bar.
 */
export type * from '../../domain/notation/engraving';

/** The score's notation set on the staves, with horizontal places along the tape. */
export function layoutNotation(score: Score): NotationLayout {
  return engrave(score, (bar, beat) => beatPosition(score, bar, beat));
}
