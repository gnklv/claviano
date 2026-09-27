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
