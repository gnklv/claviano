import type { Hand } from '../../../domain/note';
import { MUSIC_FONT } from './glyphs';

/*
 * The staff drawn as data: every part of it is a list of these shapes, which a renderer then puts
 * on its surface (SvgStaff makes SVG of them; a canvas draws them as they are). Seven kinds, all a
 * canvas draws directly, and a group, whose colour what is in it may take: a chord is a group, so
 * that it is lit as a whole.
 */

/** A colour as CSS says it: one of the theme's (see COLORS), or `currentColor`, its group's. */
export type Paint = string;

/** The theme's colours, the CSS variables of ui/styles.css: SVG takes them as they are, a canvas reads what they stand for. */
export const COLORS = {
  background: 'var(--surface)',
  staffLine: 'var(--staff-line)',
  barLine: 'var(--bar-line)',
  barNumber: 'var(--bar-number)',
  clef: 'var(--ink)',
  note: 'var(--ink)',
  hand: { right: 'var(--right)', left: 'var(--left)' } satisfies Record<Hand, string>,
  loop: 'var(--loop)',
  loopEdge: 'var(--loop-edge)',
  cursor: 'var(--cursor)',
};

/** Words, or a glyph of the music font (whose reference line is at `y`). */
export interface TextShape {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Its font's size, in pixels. */
  readonly size: number;
  readonly font: string;
  readonly fill: Paint;
  /** Where `x` is along it: at its start unless said. */
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly italic?: boolean;
  readonly bold?: boolean;
  readonly opacity?: number;
}

export interface LineShape {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: Paint;
  readonly width: number;
}

/** Lines through points (x, y, x, y…), not filled. */
export interface PolylineShape {
  readonly kind: 'polyline';
  readonly points: readonly number[];
  readonly stroke: Paint;
  readonly width: number;
  /** Dashes: as long as the first, apart by the second. */
  readonly dash?: readonly [number, number];
}

/** A filled shape through points (x, y, x, y…). */
export interface PolygonShape {
  readonly kind: 'polygon';
  readonly points: readonly number[];
  readonly fill: Paint;
}

export interface RectShape {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: Paint;
  readonly opacity?: number;
}

export interface EllipseShape {
  readonly kind: 'ellipse';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly width: number;
}

/** A path as SVG writes it (a canvas reads the same through Path2D): filled, stroked, or both. */
export interface PathShape {
  readonly kind: 'path';
  readonly d: string;
  readonly fill?: Paint;
  readonly stroke?: Paint;
  readonly width?: number;
  /** Round ends to a stroke. */
  readonly round?: boolean;
}

/** Shapes together, in a colour that those painted `currentColor` take. */
export interface GroupShape {
  readonly kind: 'group';
  readonly color?: Paint;
  readonly children: Shape[];
}

export type Shape = TextShape | LineShape | PolylineShape | PolygonShape | RectShape | EllipseShape | PathShape | GroupShape;

export const group = (children: Shape[] = [], color?: Paint): GroupShape => ({ kind: 'group', color, children });

/** A music glyph (reference line at `y`), in its group's colour unless another is given: it lights up with its chord. */
export const noteGlyph = (space: number, codepoint: string, x: number, y: number, fill: Paint = 'currentColor', anchor?: TextShape['anchor']): TextShape => ({
  kind: 'text',
  x,
  y,
  text: codepoint,
  size: space * 4,
  font: MUSIC_FONT,
  fill,
  anchor,
});

/** A music glyph in the ink colour, outside the chords that light up. */
export const inked = (space: number, codepoint: string, x: number, y: number, anchor?: TextShape['anchor']): TextShape => noteGlyph(space, codepoint, x, y, COLORS.note, anchor);

/** A line (a bracket, a hairpin) in the ink colour. */
export const inkedPolyline = (points: readonly number[], width: number, dash?: readonly [number, number]): PolylineShape => ({ kind: 'polyline', points, stroke: COLORS.note, width, dash });

/**
 * Where a shape, and all within it, lies along the tape (its leftmost and rightmost x), from what
 * it is drawn with: nothing is measured. Null where that cannot be read (a path of other commands
 * than moves, lines and curves): such a shape is taken to be everywhere.
 */
export function extentOf(shape: Shape): [number, number] | null {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  const add = (xs: readonly number[]) => {
    for (const x of xs) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  };
  const read = (each: Shape): boolean => {
    switch (each.kind) {
      case 'group':
        return each.children.every(read);
      case 'text': {
        // A sign is no wider than its font is high, letter by letter: room enough, without measuring it.
        const wide = each.size * each.text.length;
        const from = each.anchor === 'middle' ? each.x - wide / 2 : each.anchor === 'end' ? each.x - wide : each.x;
        add([from, from + wide]);
        return true;
      }
      case 'line':
        add([each.x1, each.x2]);
        return true;
      case 'rect':
        add([each.x, each.x + each.width]);
        return true;
      case 'ellipse':
        add([each.cx - each.rx, each.cx + each.rx]);
        return true;
      case 'polygon':
      case 'polyline':
        add(each.points.filter((_, i) => i % 2 === 0));
        return true;
      case 'path': {
        // Paths of points in pairs only (moves, lines and curves, drawn in place): others are not read.
        if (!/^[MLCQZ\d\s.,e-]*$/.test(each.d)) return false;
        add((each.d.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0));
        return true;
      }
    }
  };
  return read(shape) && left <= right ? [left, right] : null;
}
