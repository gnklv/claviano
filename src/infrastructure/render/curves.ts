/*
 * Ties and slurs are drawn like in print: a crescent, thin at the ends and thicker in the
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
  return crescent(x1, y, x2, y, height, THICKNESS * space, above);
}

export interface SlurOptions {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly above: boolean;
  readonly space: number;
  /** Points the slur must pass clear of (noteheads, stem ends between its ends). */
  readonly obstacles?: readonly { readonly x: number; readonly y: number }[];
}

/** Slurs span phrases, so they may bulge more than ties, and must clear the notes they cover. */
const SLUR_HEIGHT_PER_LENGTH = 0.12;
const SLUR_MIN_HEIGHT = 0.8;
const SLUR_MAX_HEIGHT = 4;
const SLUR_CLEARANCE = 0.8;

/**
 * A phrasing slur: like a tie, but its ends may sit at different heights, and it rises (or sinks)
 * as far as needed to pass clear of every obstacle between them.
 */
export function slur({ x1, y1, x2, y2, above, space, obstacles = [] }: SlurOptions): ArcShape {
  const length = Math.max(1, x2 - x1);
  const sign = above ? -1 : 1;
  const lineY = (x: number) => y1 + ((y2 - y1) * (x - x1)) / length;
  let height = Math.max(SLUR_MIN_HEIGHT * space, length * SLUR_HEIGHT_PER_LENGTH);
  for (const point of obstacles) {
    // How far past the straight line between the ends the obstacle reaches, towards the bulge.
    const beyond = sign * (point.y - lineY(point.x));
    height = Math.max(height, beyond + SLUR_CLEARANCE * space);
  }
  height = Math.min(height, SLUR_MAX_HEIGHT * space);
  return crescent(x1, y1, x2, y2, height, THICKNESS * space, above);
}

/**
 * The crescent between (x1, y1) and (x2, y2): an outer cubic Bézier bulging `height` from the
 * straight line between the ends at its middle, and an inner one `thickness` less, closed.
 */
function crescent(x1: number, y1: number, x2: number, y2: number, height: number, thickness: number, above: boolean): ArcShape {
  const length = x2 - x1;
  const sign = above ? -1 : 1; // screen y grows downwards
  const lineY = (x: number) => y1 + (length ? ((y2 - y1) * (x - x1)) / length : 0);
  const c1 = x1 + length * SHOULDER;
  const c2 = x2 - length * SHOULDER;
  // With control points at a quarter and three quarters, the curve's middle reaches 3/4 of their offset.
  const outer = (sign * height * 4) / 3;
  const inner = (sign * (height - thickness) * 4) / 3;
  const r = (value: number) => Math.round(value * 100) / 100;
  const path =
    `M ${r(x1)} ${r(y1)} C ${r(c1)} ${r(lineY(c1) + outer)} ${r(c2)} ${r(lineY(c2) + outer)} ${r(x2)} ${r(y2)} ` +
    `C ${r(c2)} ${r(lineY(c2) + inner)} ${r(c1)} ${r(lineY(c1) + inner)} ${r(x1)} ${r(y1)} Z`;
  return { height, thickness, path };
}
