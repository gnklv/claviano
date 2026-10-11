import { describe, expect, it } from 'vitest';
import { momentIn, placeIn, spaceBar, type Column } from '../src/domain/notation/spacing';

/* How wide a bar is drawn: by its time, and wider where its notes are crowded. In staff spaces. */

const note = (at: number, before = 0, after = 1.2): Column => ({ at, before, after });

describe('a bar set out', () => {
  it('is as wide as it is by nature when nothing in it is crowded, each note as far along as its time', () => {
    const bar = spaceBar([note(0), note(0.25), note(0.5), note(0.75)], 20);
    expect(bar.width).toBe(20);
    expect(bar.marks.map((mark) => mark.x)).toEqual([0, 5, 10, 15, 20]);
  });

  it('is its natural width when empty', () => {
    expect(spaceBar([], 20)).toEqual({ marks: [{ at: 0, x: 0 }, { at: 1, x: 20 }], width: 20 });
  });

  it('is let out where notes are closer in time than they are wide, and only there', () => {
    // Four quick notes in the first eighth of the bar, then one on the half.
    const quick = [0, 1 / 32, 2 / 32, 3 / 32].map((at) => note(at));
    const bar = spaceBar([...quick, note(0.5)], 20);
    // The quick ones stand a head and a little apart, not the 0.6 of a space their time would give.
    expect(bar.marks[1].x - bar.marks[0].x).toBeCloseTo(1.5);
    expect(bar.marks[2].x - bar.marks[1].x).toBeCloseTo(1.5);
    // From the last quick one to the half: as its time, as before.
    expect(bar.marks[4].x - bar.marks[3].x).toBeCloseTo((0.5 - 3 / 32) * 20);
    expect(bar.width).toBeGreaterThan(20);
  });

  it('gives a note room for what stands before it: an accidental, grace notes', () => {
    const plain = spaceBar([note(0), note(1 / 16)], 20);
    const sharpened = spaceBar([note(0), note(1 / 16, 1.4)], 20);
    expect(sharpened.marks[1].x - plain.marks[1].x).toBeCloseTo(1.4);
  });

  it('takes notes of one moment on two staves as one, with the most either needs', () => {
    const bar = spaceBar([note(0), note(1 / 16, 0, 1.2), note(1 / 16, 1.4, 2.4), note(2 / 16)], 20);
    expect(bar.marks).toHaveLength(4);
    // After the wide one, before the next: its 2.4 and the gap.
    expect(bar.marks[2].x - bar.marks[1].x).toBeCloseTo(2.7);
  });

  it('leaves the last note room before the next bar’s line', () => {
    const bar = spaceBar([note(0), note(63 / 64, 0, 3)], 20);
    expect(bar.width - bar.marks.at(-2)!.x).toBeCloseTo(4.7);
  });

  it('is in order whatever order its columns are told in', () => {
    const forth = spaceBar([note(0), note(0.5), note(0.75)], 20);
    const back = spaceBar([note(0.75), note(0), note(0.5)], 20);
    expect(back).toEqual(forth);
  });
});

describe('a place in a bar set out', () => {
  const bar = spaceBar([0, 1 / 32, 2 / 32, 3 / 32, 0.5].map((at) => note(at)), 20);

  it('is where its moment is, between its neighbours as its time is between theirs', () => {
    expect(placeIn(bar, 0)).toBe(0);
    expect(placeIn(bar, 1)).toBe(bar.width);
    expect(placeIn(bar, 1 / 64)).toBeCloseTo(0.75);
    // Never past the bar.
    expect(placeIn(bar, 2)).toBe(bar.width);
    expect(placeIn(bar, -1)).toBe(0);
  });

  it('is found again from where it stands', () => {
    for (const at of [0, 1 / 64, 1 / 32, 0.2, 0.5, 0.9, 1]) expect(momentIn(bar, placeIn(bar, at))).toBeCloseTo(at);
  });
});
