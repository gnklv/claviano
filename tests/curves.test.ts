import { describe, expect, it } from 'vitest';
import { arc } from '../src/infrastructure/render/curves';

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
