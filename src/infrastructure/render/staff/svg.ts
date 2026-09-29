import type { Hand } from '../../../domain/note';
import { MUSIC_FONT } from './glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Theme colors, defined as CSS variables in ui/styles.css; the browser recolors on a theme switch. */
export const COLORS = {
  background: 'var(--surface)',
  staffLine: 'var(--staff-line)',
  barLine: 'var(--bar-line)',
  barNumber: 'var(--bar-number)',
  clef: 'var(--ink)',
  note: 'var(--ink)',
  hand: { right: 'var(--right)', left: 'var(--left)' } satisfies Record<Hand, string>,
  loop: 'var(--loop)',
  cursor: 'var(--cursor)',
};

/** Paint goes through `style`, not attributes: only CSS understands var(--…) colors. */
const PAINT = new Set(['fill', 'stroke']);

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (PAINT.has(name)) element.style.setProperty(name, String(value));
    else element.setAttribute(name, String(value));
  }
  return element;
}

/** A music glyph (reference line at `y`) painted in its group's current color: it lights up with its chord. */
export function noteGlyph(space: number, codepoint: string, x: number, y: number): SVGTextElement {
  const text = svg('text', { x, y, fill: 'currentColor', 'font-size': space * 4, 'font-family': MUSIC_FONT });
  text.textContent = codepoint;
  return text;
}

/** A music glyph in the ink colour, outside the chords that light up. */
export function inked(space: number, codepoint: string, x: number, y: number): SVGTextElement {
  const glyph = noteGlyph(space, codepoint, x, y);
  glyph.style.setProperty('fill', COLORS.note);
  return glyph;
}

/** A line (a bracket, a hairpin) in the ink colour. */
export function inkedPolyline(attributes: Record<string, string | number>): SVGPolylineElement {
  const line = svg('polyline', attributes);
  line.style.setProperty('stroke', COLORS.note);
  return line;
}
