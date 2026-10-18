import { describe, expect, it } from 'vitest';
import { approach, HandHold, HOLD_SECONDS, SeekWatch } from '../src/infrastructure/render/following';

/* A view moved away from the music by hand: when it lets go, and how it glides. */

describe('a view held by hand', () => {
  it('holds where it was put while the music stands still, and lets go after a while of playing', () => {
    const hold = new HandHold<number>();
    hold.hold(120);
    expect(hold.pass(10, false, false)).toBeNull();
    expect(hold.value).toBe(120);
    expect(hold.pass(HOLD_SECONDS - 0.5, true, false)).toBeNull();
    expect(hold.pass(0.5, true, false)).toBe(120);
    expect(hold.value).toBeNull();
    expect(hold.pass(1, true, false)).toBeNull();
  });

  it('lets go at once when the music is sent elsewhere, and holds afresh when moved again', () => {
    const hold = new HandHold<number>();
    hold.hold(1);
    expect(hold.pass(0, true, true)).toBe(1);
    hold.hold(2);
    hold.pass(HOLD_SECONDS - 1, true, false);
    hold.hold(3);
    expect(hold.pass(HOLD_SECONDS - 1, true, false)).toBeNull();
    expect(hold.value).toBe(3);
  });
});

describe('the music sent elsewhere', () => {
  it('is told from the music playing on', () => {
    const seeks = new SeekWatch();
    expect(seeks.seeked(0.016)).toBe(false);
    expect(seeks.seeked(0.033)).toBe(false);
    expect(seeks.seeked(12)).toBe(true);
    expect(seeks.seeked(12.016)).toBe(false);
    expect(seeks.position).toBe(12.016);
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
