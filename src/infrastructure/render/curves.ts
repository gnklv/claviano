/*
 * Ties (and later slurs) are drawn like in print: a crescent, thin at the ends and thicker in the
 * middle, made of two cubic Bézier curves — the outer edge there, the inner edge back.
 */

export interface ArcOptions {
  readonly x1: number;
  readonly x2: number;
  /** The height of both ends (ties join notes of the same pitch). */
  readonly y: number;
  /** Bulge upwards (true) or downwards (false). */
  readonly above: boolean;
  /** One staff space in pixels; sizes scale with it. */
  readonly space: number;
}

export interface ArcShape {
  /** Height of the outer edge's bulge. */
  readonly height: number;
  readonly thickness: number;
  /** The SVG path, ready for `<path d>`. */
  readonly path: string;
}

/** Longer arcs bulge more, within limits: flat on short ties, not balloons on long ones. */
const HEIGHT_PER_LENGTH = 0.15;
const MIN_HEIGHT = 0.6;
const MAX_HEIGHT = 1.8;
const THICKNESS = 0.22;
/** Control points sit this far in from each end, as a share of the length. */
const SHOULDER = 0.25;

export function arc({ x1, x2, y, above, space }: ArcOptions): ArcShape {
  const length = Math.max(0, x2 - x1);
  const height = Math.min(MAX_HEIGHT * space, Math.max(MIN_HEIGHT * space, length * HEIGHT_PER_LENGTH));
  const thickness = THICKNESS * space;
  const sign = above ? -1 : 1; // screen y grows downwards

  const c1 = x1 + length * SHOULDER;
  const c2 = x2 - length * SHOULDER;
  // Bézier control points overshoot: the curve reaches ~3/4 of their height.
  const outer = y + (sign * height * 4) / 3;
  const inner = y + (sign * (height - thickness) * 4) / 3;
  const r = (value: number) => Math.round(value * 100) / 100;
  const path =
    `M ${r(x1)} ${r(y)} C ${r(c1)} ${r(outer)} ${r(c2)} ${r(outer)} ${r(x2)} ${r(y)} ` +
    `C ${r(c2)} ${r(inner)} ${r(c1)} ${r(inner)} ${r(x1)} ${r(y)} Z`;
  return { height, thickness, path };
}
