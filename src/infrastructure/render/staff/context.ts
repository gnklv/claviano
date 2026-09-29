import type { Score } from '../../../domain/score';
import type { StaffGeometry } from './geometry';
import type { StaffInk } from './ink';

/** What every part of the drawing works from: the piece, where things go, and the notes as drawn. */
export interface StaffContext {
  readonly score: Score;
  readonly geometry: StaffGeometry;
  readonly ink: StaffInk;
}
