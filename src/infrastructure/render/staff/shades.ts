import { SAME_MOMENT } from '../../../domain/moment';
import type { Score, TimeRange } from '../../../domain/score';
import { barPosition } from '../staffLayout';
import type { StaffGeometry } from './geometry';
import { COLORS, type EllipseShape, type RectShape, type Shape } from './shapes';

/* Shades behind the music on the tape: bars under the pointer or being selected, and the loop. */

/** Printed bars `from..to` washed in the loop's colour, `opacity` of it (faint for a bar under the pointer). */
export function barsShade(geometry: StaffGeometry, from: number, to: number, opacity: number): RectShape {
  const { space } = geometry;
  const x = geometry.barLineX(from);
  return {
    kind: 'rect',
    x,
    y: geometry.trebleTop() - 3 * space,
    width: geometry.barLineX(to + 1) - x,
    height: geometry.systemBottom() - geometry.trebleTop() + 6 * space,
    fill: COLORS.loop,
    opacity,
  };
}

/** The loop's bars: a wash over them, and a line at each end. */
export function loopShade(geometry: StaffGeometry, score: Score, loop: TimeRange): Shape[] {
  const { space } = geometry;
  const top = geometry.trebleTop();
  const start = geometry.edgeX(barPosition(score, loop.start));
  // The end of the loop's last bar: the next bar played may be printed earlier (a repeat).
  const end = geometry.edgeX(barPosition(score, Math.max(loop.start, loop.end - SAME_MOMENT)));
  const y = top - 3 * space;
  const height = geometry.systemBottom() - top + 6 * space;
  return [
    { kind: 'rect', x: start, y, width: Math.max(0, end - start), height, fill: COLORS.loop },
    ...[start, end].map((x): Shape => ({ kind: 'path', d: `M${x} ${y}V${y + height}`, stroke: COLORS.loopEdge, width: 1 })),
  ];
}

/**
 * A note being fingered: a wash round its head and a ring in the loop's edge colour, as its tile is
 * ringed among the falling notes (a wash alone is lost among the heads). The ring clears the head
 * and its neighbours a step away; its weight was tuned by eye, against a phone's staff.
 */
export function noteShade(geometry: StaffGeometry, x: number, y: number): EllipseShape {
  const { space } = geometry;
  return { kind: 'ellipse', cx: x, cy: y, rx: 1.2 * space, ry: 0.95 * space, fill: COLORS.loop, stroke: COLORS.loopEdge, width: 0.2 * space };
}
