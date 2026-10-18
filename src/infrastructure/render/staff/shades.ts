import { SAME_MOMENT } from '../../../domain/moment';
import type { Score, TimeRange } from '../../../domain/score';
import { barPosition } from '../staffLayout';
import type { StaffGeometry } from './geometry';
import { COLORS, svg } from './svg';

/* Shades behind the music on the tape: bars under the pointer or being selected, and the loop. */

/** Printed bars `from..to` washed in the loop's colour, `opacity` of it (faint for a bar under the pointer). */
export function barsShade(geometry: StaffGeometry, from: number, to: number, opacity: number): SVGRectElement {
  const { space } = geometry;
  const x = geometry.barLineX(from);
  const rect = svg('rect', {
    x,
    y: geometry.trebleTop() - 3 * space,
    width: geometry.barLineX(to + 1) - x,
    height: geometry.systemBottom() - geometry.trebleTop() + 6 * space,
    fill: COLORS.loop,
  });
  rect.style.opacity = String(opacity);
  return rect;
}

/** The loop's bars: a wash over them, and a line at each end. */
export function loopShade(geometry: StaffGeometry, score: Score, loop: TimeRange): SVGElement[] {
  const { space } = geometry;
  const top = geometry.trebleTop();
  const start = geometry.edgeX(barPosition(score, loop.start));
  // The end of the loop's last bar: the next bar played may be printed earlier (a repeat).
  const end = geometry.edgeX(barPosition(score, Math.max(loop.start, loop.end - SAME_MOMENT)));
  const y = top - 3 * space;
  const height = geometry.systemBottom() - top + 6 * space;
  return [
    svg('rect', { x: start, y, width: Math.max(0, end - start), height, fill: COLORS.loop }),
    ...[start, end].map((x) => svg('path', { d: `M${x} ${y}V${y + height}`, stroke: COLORS.loopEdge, 'stroke-width': 1 })),
  ];
}
