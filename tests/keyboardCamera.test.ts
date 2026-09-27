import { describe, expect, it } from 'vitest';
import { approach, clampOffset, followTarget, pickSpan } from '../src/infrastructure/render/keyboardCamera';

/** A 1000px keyboard seen through a 300px screen. */
const view = { contentWidth: 1000, viewWidth: 300 };
const MARGIN = 20;

describe('clampOffset', () => {
  it('keeps the view inside the keyboard', () => {
    expect(clampOffset(-50, view)).toBe(0);
    expect(clampOffset(900, view)).toBe(700);
    expect(clampOffset(400, view)).toBe(400);
  });

  it('pins to 0 when the keyboard fits on screen', () => {
    expect(clampOffset(100, { contentWidth: 200, viewWidth: 300 })).toBe(0);
  });
});

describe('followTarget', () => {
  it('stays put while the upcoming notes are visible', () => {
    expect(followTarget(400, { left: 450, right: 600 }, view, MARGIN)).toBe(400);
  });

  it('moves right just enough to show notes beyond the right edge', () => {
    // right edge of view is 700; notes end at 750 → shift so 750 + margin is the new edge
    expect(followTarget(400, { left: 600, right: 750 }, view, MARGIN)).toBe(470);
  });

  it('moves left just enough to show notes beyond the left edge', () => {
    expect(followTarget(400, { left: 350, right: 500 }, view, MARGIN)).toBe(330);
  });

  it('centres notes that do not fit on screen together', () => {
    expect(followTarget(0, { left: 100, right: 700 }, view, MARGIN)).toBe(250);
  });

  it('never looks past the ends of the keyboard', () => {
    expect(followTarget(400, { left: 950, right: 1000 }, view, MARGIN)).toBe(700);
    expect(followTarget(400, { left: 0, right: 40 }, view, MARGIN)).toBe(0);
  });

  it('keeps its position when there is nothing to follow', () => {
    expect(followTarget(400, null, view, MARGIN)).toBe(400);
  });
});

describe('pickSpan', () => {
  const next2s = { left: 0, right: 600 };
  const next1s = { left: 400, right: 600 };
  const nextHalf = { left: 500, right: 600 };

  it('follows everything coming up when it fits', () => {
    expect(pickSpan([next1s, nextHalf], 300, MARGIN)).toBe(next1s);
  });

  it('falls back to the nearer notes when the farther ones do not fit together', () => {
    expect(pickSpan([next2s, next1s, nextHalf], 300, MARGIN)).toBe(next1s);
  });

  it('returns the nearest span when nothing fits', () => {
    expect(pickSpan([next2s, next2s], 300, MARGIN)).toBe(next2s);
  });

  it('skips empty look-aheads', () => {
    expect(pickSpan([null, nextHalf], 300, MARGIN)).toBe(nextHalf);
    expect(pickSpan([null, null], 300, MARGIN)).toBeNull();
  });
});

describe('approach', () => {
  it('moves part of the way each frame and arrives eventually', () => {
    let x = 0;
    x = approach(x, 100, 1 / 60);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(100);
    for (let i = 0; i < 120; i++) x = approach(x, 100, 1 / 60);
    expect(x).toBe(100);
  });

  it('covers the same distance in the same time at any frame rate', () => {
    let at60 = 0;
    let at120 = 0;
    for (let i = 0; i < 6; i++) at60 = approach(at60, 100, 1 / 60);
    for (let i = 0; i < 12; i++) at120 = approach(at120, 100, 1 / 120);
    expect(at60).toBeCloseTo(at120, 5);
  });
});
