import type { Shape } from './shapes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Paint goes through `style`, not attributes: only CSS understands var(--…) colors. */
const PAINT = new Set(['fill', 'stroke', 'color', 'opacity']);

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number | undefined> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    if (PAINT.has(name)) element.style.setProperty(name, String(value));
    else element.setAttribute(name, String(value));
  }
  return element;
}

/** Points (x, y, x, y…) as SVG lists them. */
const pointsOf = (points: readonly number[]): string => points.reduce<string[]>((pairs, n, i) => (i % 2 ? pairs : [...pairs, `${n},${points[i + 1]}`]), []).join(' ');

/** A shape of the staff as SVG. */
export function toSvg(shape: Shape): SVGElement {
  switch (shape.kind) {
    case 'text': {
      const text = svg('text', {
        x: shape.x,
        y: shape.y,
        fill: shape.fill,
        'font-size': shape.size,
        'font-family': shape.font,
        'text-anchor': shape.anchor,
        'font-style': shape.italic ? 'italic' : undefined,
        'font-weight': shape.bold ? 'bold' : undefined,
      });
      // (An attribute, not a paint: it pales the glyph whatever colour it is lit in.)
      if (shape.opacity !== undefined) text.setAttribute('opacity', String(shape.opacity));
      text.textContent = shape.text;
      return text;
    }
    case 'line':
      return svg('line', { x1: shape.x1, x2: shape.x2, y1: shape.y1, y2: shape.y2, stroke: shape.stroke, 'stroke-width': shape.width });
    case 'polyline':
      return svg('polyline', { points: pointsOf(shape.points), fill: 'none', stroke: shape.stroke, 'stroke-width': shape.width, 'stroke-dasharray': shape.dash?.join(' ') });
    case 'polygon':
      return svg('polygon', { points: pointsOf(shape.points), fill: shape.fill });
    case 'rect':
      return svg('rect', { x: shape.x, y: shape.y, width: shape.width, height: shape.height, fill: shape.fill, opacity: shape.opacity });
    case 'ellipse':
      return svg('ellipse', { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry, fill: shape.fill, stroke: shape.stroke, 'stroke-width': shape.width });
    case 'path':
      return svg('path', { d: shape.d, fill: shape.fill, stroke: shape.stroke, 'stroke-width': shape.width, 'stroke-linecap': shape.round ? 'round' : undefined });
    case 'group': {
      const element = svg('g', { color: shape.color });
      element.append(...shape.children.map(toSvg));
      return element;
    }
  }
}

/** To a tenth of a pixel: what moves less is the noise of arithmetic, not a move to show. */
export const tenth = (px: number): number => Math.round(px * 10) / 10;
