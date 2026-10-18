import type { RollColors } from '../../../application/ports/RollView';

/* What the parts of the falling notes draw with: the canvas, and the theme's colours. */

export interface RollPen {
  readonly ctx: CanvasRenderingContext2D;
  readonly colors: RollColors;
}

/** What is not played is drawn this faint: a muted hand's notes, the pedals when they are off. */
export const MUTED_ALPHA = 0.25;
