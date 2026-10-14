import { describe, expect, it } from 'vitest';
import { arc, slur } from '../src/infrastructure/render/curves';

const SPACE = 10;

describe('arc', () => {
  it('starts and ends at the given points', () => {
    const { path } = arc({ x1: 0, x2: 100, y: 50, above: true, space: SPACE });
    expect(path.startsWith('M 0 50')).toBe(true);
    expect(path).toContain(' 100 50 C');
    expect(path.endsWith('0 50 Z')).toBe(true);
  });

  it('bulges up when above and down when below', () => {
    const control = (path: string) => Number(path.split(' ')[5]); // y of the first control point
    expect(control(arc({ x1: 0, x2: 100, y: 50, above: true, space: SPACE }).path)).toBeLessThan(50);
    expect(control(arc({ x1: 0, x2: 100, y: 50, above: false, space: SPACE }).path)).toBeGreaterThan(50);
  });

  it('grows with length, within limits', () => {
    expect(arc({ x1: 0, x2: 20, y: 0, above: true, space: SPACE }).height).toBe(6); // the minimum
    expect(arc({ x1: 0, x2: 100, y: 0, above: true, space: SPACE }).height).toBe(15);
    expect(arc({ x1: 0, x2: 1000, y: 0, above: true, space: SPACE }).height).toBe(18); // the maximum
  });

  it('is thicker in the middle than at the ends', () => {
    expect(arc({ x1: 0, x2: 100, y: 0, above: true, space: SPACE }).thickness).toBeGreaterThan(0);
  });
});

describe('slur', () => {
  it('joins ends at different heights', () => {
    const { path } = slur({ x1: 0, y1: 50, x2: 100, y2: 30, above: true, space: SPACE });
    expect(path.startsWith('M 0 50')).toBe(true);
    expect(path).toContain(' 100 30 C');
  });

  it('rises high enough to clear the notes it passes over', () => {
    // A note at x=50 reaching 20 px above the line between the ends: the slur needs 20 + clearance.
    const clear = slur({ x1: 0, y1: 100, x2: 100, y2: 100, above: true, space: SPACE, obstacles: [{ x: 50, y: 80 }] });
    expect(clear.height).toBeGreaterThanOrEqual(20 + 8);
  });

  it('ignores obstacles on the other side', () => {
    const plain = slur({ x1: 0, y1: 100, x2: 100, y2: 100, above: true, space: SPACE });
    const withLowNote = slur({ x1: 0, y1: 100, x2: 100, y2: 100, above: true, space: SPACE, obstacles: [{ x: 50, y: 140 }] });
    expect(withLowNote.height).toBe(plain.height);
  });

  it('never balloons', () => {
    const capped = slur({ x1: 0, y1: 100, x2: 100, y2: 100, above: true, space: SPACE, obstacles: [{ x: 50, y: -500 }] });
    expect(capped.height).toBe(40);
  });
});

describe('a slur bulging towards the other staff', () => {
  // A long slur under a run on the upper staff: from (0, 100) to (1000, 160), in a staff of 10px spaces.
  const under = (limits: { x: number; y: number }[] = []) => slur({ x1: 0, y1: 100, x2: 1000, y2: 160, above: false, space: 10, limits });

  it('bulges as deep as a slur that long may, with nothing in its way', () => {
    expect(under().height).toBe(40);
  });

  it('is flatter where notes of the other staff stand under it, and does not reach them', () => {
    // A note of the lower staff 20px under the straight line, at the middle.
    const shape = under([{ x: 500, y: 150 }]);
    expect(shape.height).toBeLessThan(40);
    // At the middle the curve stands its height off the line: clear of that note by a clearance.
    expect(130 + shape.height).toBeLessThanOrEqual(150 - 8 + 1e-9);
  });

  it('keeps a little curve even where the other staff leaves no room at all', () => {
    expect(under([{ x: 500, y: 120 }]).height).toBe(8);
  });

  it('heeds no note beyond its ends', () => {
    expect(under([{ x: -50, y: 101 }, { x: 1050, y: 161 }]).height).toBe(40);
  });
});

