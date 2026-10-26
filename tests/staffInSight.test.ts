// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MUSIC_FONT } from '../src/infrastructure/render/staff/glyphs';
import type { Shape } from '../src/infrastructure/render/staff/shapes';
import { drawStaff, flat } from './drawnStaff';
import { ode, showcase } from './staffPieces';

/* Everything a piece prints over its staves and under them is in the view: nothing is cut off at its top or its bottom. */

/**
 * How high and how low a shape reaches, read from what it is drawn with. Words reach most of their
 * size over their baseline and a quarter under; a sign of the music font, two spaces over it (an
 * 8va, a dynamic) and one under, whatever it is (a notehead reaches less).
 */
function heightOf(shape: Shape): [number, number] | null {
  switch (shape.kind) {
    case 'text':
      return shape.font === MUSIC_FONT ? [shape.y - shape.size / 2, shape.y + shape.size / 4] : [shape.y - 0.8 * shape.size, shape.y + 0.25 * shape.size];
    case 'line':
      return [Math.min(shape.y1, shape.y2), Math.max(shape.y1, shape.y2)];
    case 'rect':
      return [shape.y, shape.y + shape.height];
    case 'ellipse':
      return [shape.cy - shape.ry, shape.cy + shape.ry];
    case 'polygon':
    case 'polyline': {
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      return [Math.min(...ys), Math.max(...ys)];
    }
    case 'path': {
      const ys = (shape.d.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
      return ys.length > 0 ? [Math.min(...ys), Math.max(...ys)] : null;
    }
    default:
      return null;
  }
}

describe('a staff, top to bottom', () => {
  const SIZES = {
    'a computer': { width: 1280, height: 656 },
    'a phone held upright': { width: 375, height: 636 },
    'a phone on its side': { width: 812, height: 289 },
  };

  for (const [piece, score] of [
    ['the showcase', showcase],
    ['the Ode', ode],
  ] as const) {
    for (const [screen, size] of Object.entries(SIZES)) {
      it(`has all of ${piece} in sight on ${screen}`, () => {
        const { shown } = drawStaff(score(), size);
        const reached = flat(shown.tapeShapes).flatMap(({ shape }) => heightOf(shape) ?? []);
        const top = Math.min(...reached.filter((_, i) => i % 2 === 0));
        const bottom = Math.max(...reached.filter((_, i) => i % 2 === 1));
        expect(top).toBeGreaterThanOrEqual(0);
        expect(bottom).toBeLessThanOrEqual(size.height);
      });
    }
  }
});
