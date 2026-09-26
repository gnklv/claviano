import { describe, expect, it } from 'vitest';
import { createScore } from '../src/domain/score';
import { barPosition } from '../src/infrastructure/render/staffLayout';

/** Bars at 0, 2 and 4 seconds; the last one ends at 5 seconds (it is shorter). */
const score = createScore(
  'test',
  [{ pitch: 60, start: 0, duration: 5, velocity: 1, hand: 'right' }],
  [0, 2, 4],
);

describe('barPosition', () => {
  it('maps bar starts to whole numbers', () => {
    expect(barPosition(score, 0)).toBe(0);
    expect(barPosition(score, 2)).toBe(1);
    expect(barPosition(score, 4)).toBe(2);
  });

  it('interpolates inside a bar', () => {
    expect(barPosition(score, 1)).toBe(0.5);
    expect(barPosition(score, 3.5)).toBe(1.75);
  });

  it('gives a shorter bar the same width as the others', () => {
    expect(barPosition(score, 4.5)).toBe(2.5);
    expect(barPosition(score, 5)).toBe(3);
  });
});
