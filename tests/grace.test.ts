import { describe, expect, it } from 'vitest';
import { CRUSHED_BEATS, graceTiming } from '../src/domain/notation/grace';

const quarter = { beats: 1, dotted: false };

describe('graceTiming', () => {
  it('crushes an acciaccatura in just before the beat', () => {
    expect(graceTiming({ count: 1, slash: true }, quarter, 4)).toEqual({ start: 4 - CRUSHED_BEATS, each: CRUSHED_BEATS, delay: 0 });
  });

  it('plays a group of grace notes before the beat, one after another', () => {
    expect(graceTiming({ count: 3, slash: false }, quarter, 4)).toEqual({ start: 4 - 3 * CRUSHED_BEATS, each: CRUSHED_BEATS, delay: 0 });
  });

  it('gives an appoggiatura half of the note it leads to, on the beat', () => {
    expect(graceTiming({ count: 1, slash: false }, { beats: 2, dotted: false }, 4)).toEqual({ start: 4, each: 1, delay: 1 });
  });

  it('gives an appoggiatura two thirds of a dotted note', () => {
    expect(graceTiming({ count: 1, slash: false }, { beats: 1.5, dotted: true }, 4)).toEqual({ start: 4, each: 1, delay: 1 });
  });

  it('plays grace notes at the very start of the piece on the beat, the note after them', () => {
    expect(graceTiming({ count: 2, slash: true }, quarter, 0)).toEqual({ start: 0, each: CRUSHED_BEATS, delay: 2 * CRUSHED_BEATS });
    // Never more than half of a short note.
    expect(graceTiming({ count: 2, slash: true }, { beats: 0.25, dotted: false }, 0).delay).toBeCloseTo(0.125);
  });

  it('plays grace notes after the last note of a bar before the bar line', () => {
    expect(graceTiming({ count: 2, slash: false }, null, 8)).toEqual({ start: 8 - 2 * CRUSHED_BEATS, each: CRUSHED_BEATS, delay: 0 });
  });
});
