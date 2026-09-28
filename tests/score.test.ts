import { describe, expect, it } from 'vitest';
import type { Note } from '../src/domain/note';
import {
  barIndexNear,
  playedBarNear,
  timeAtPage,
  barLengthInBeats,
  barNumber,
  writtenBeatAt,
  createScore,
  hasPickup,
  keySignatureAt,
  timeSignatureAt,
} from '../src/domain/score';

/** One long note, so the score lasts 12 seconds. At 60 BPM a beat is a second. */
const note: Note = { pitch: 60, start: 0, duration: 12, beat: 0, beats: 12, velocity: 1, hand: 'right' };

const score = createScore('test', [note], [0, 4, 8], {
  barBeats: [0, 4, 8],
  timeSignatures: [
    { beat: 0, numerator: 4, denominator: 4 },
    { beat: 8, numerator: 3, denominator: 4 },
  ],
  keySignatures: [
    { beat: 4, fifths: 1, minor: false },
    { beat: 8, fifths: -3, minor: true },
  ],
});

describe('createScore', () => {
  it('keeps bar times and bar beats aligned when it sorts and filters them', () => {
    const s = createScore('test', [note], [8, 0, 4, 20], { barBeats: [8, 0, 4, 20] });
    expect(s.bars).toEqual([0, 4, 8]); // the bar at 20 s is past the end
    expect(s.barBeats).toEqual([0, 4, 8]);
  });

  it('drops repeated signatures, as files often store them once per track', () => {
    const s = createScore('test', [note], [0], {
      keySignatures: [
        { beat: 0, fifths: 0, minor: true },
        { beat: 0, fifths: 0, minor: true },
        { beat: 4, fifths: 0, minor: true }, // same key again: not a change
        { beat: 8, fifths: 2, minor: false },
      ],
    });
    expect(s.keySignatures).toEqual([
      { beat: 0, fifths: 0, minor: true },
      { beat: 8, fifths: 2, minor: false },
    ]);
  });

  it('adds a default key signature at the start when the first one comes later', () => {
    expect(score.keySignatures[0]).toEqual({ beat: 0, fifths: 0, minor: false });
  });
});

describe('signature lookup', () => {
  it('finds the time signature in force at a beat', () => {
    expect(timeSignatureAt(score, 7.9)).toMatchObject({ numerator: 4 });
    expect(timeSignatureAt(score, 8)).toMatchObject({ numerator: 3 });
  });

  it('finds the key signature in force at a beat', () => {
    expect(keySignatureAt(score, 2).fifths).toBe(0);
    expect(keySignatureAt(score, 5).fifths).toBe(1);
    expect(keySignatureAt(score, 9)).toMatchObject({ fifths: -3, minor: true });
  });
});

describe('writtenBeatAt', () => {
  it('converts seconds to beats through the bars', () => {
    expect(writtenBeatAt(score, 2)).toBe(2);
    expect(writtenBeatAt(score, 6)).toBe(6);
  });

  it('follows repeats back along the page', () => {
    // Printed bars 0 and 1 (4 beats each), played 0 1 0 1: at 10 s we are in the second pass of bar 0.
    const repeated = createScore('test', [{ ...note, duration: 16, beats: 16 }], [0, 4, 8, 12], {
      barBeats: [0, 4, 8, 12],
      barWritten: [0, 1, 0, 1],
      writtenBarBeats: [0, 4],
      writtenEndBeat: 8,
    });
    expect(writtenBeatAt(repeated, 10)).toBe(2);
    expect(barNumber(repeated, 2)).toBe(1); // the third bar played is printed bar 1 again
    expect(barIndexNear(repeated, 2, 0)).toBe(1); // bar 2 is first played as the second bar
    expect(barIndexNear(repeated, 2, 13)).toBe(3); // …and again as the fourth
  });

  it('picks the pass of a repeated bar nearest to a moment, and places a beat on it', () => {
    const repeated = createScore('test', [{ ...note, duration: 16, beats: 16 }], [0, 4, 8, 12], {
      barBeats: [0, 4, 8, 12],
      barWritten: [0, 1, 0, 1],
      writtenBarBeats: [0, 4],
      writtenEndBeat: 8,
    });
    expect(playedBarNear(repeated, 0, 1)).toBe(0); // on the first pass
    expect(playedBarNear(repeated, 0, 6)).toBe(0); // after it, nearer than the second
    expect(playedBarNear(repeated, 0, 7.5)).toBe(2); // nearer the second pass
    expect(timeAtPage(repeated, 1, 5, 11)).toBe(13); // beat 1 of printed bar 1, second pass
  });
});

describe('barLengthInBeats', () => {
  it('counts quarter notes per bar', () => {
    expect(barLengthInBeats({ beat: 0, numerator: 3, denominator: 4 })).toBe(3);
    expect(barLengthInBeats({ beat: 0, numerator: 6, denominator: 8 })).toBe(3);
    expect(barLengthInBeats({ beat: 0, numerator: 2, denominator: 2 })).toBe(4);
  });
});

describe('bar numbers', () => {
  // 3/4 with a one-beat pickup: bars start at beats 0, 1, 4.
  const withPickup = createScore('test', [note], [0, 1, 4], {
    barBeats: [0, 1, 4],
    timeSignatures: [{ beat: 0, numerator: 3, denominator: 4 }],
  });

  it('recognises a pickup: a first bar shorter than its time signature', () => {
    expect(hasPickup(withPickup)).toBe(true);
    expect(hasPickup(score)).toBe(false);
  });

  it('numbers a pickup 0 and the first full bar 1', () => {
    expect([0, 1, 2].map((i) => barNumber(withPickup, i))).toEqual([0, 1, 2]);
    expect(barIndexNear(withPickup, 1, 0)).toBe(1);
  });

  it('numbers bars from 1 without a pickup', () => {
    expect([0, 1, 2].map((i) => barNumber(score, i))).toEqual([1, 2, 3]);
    expect(barIndexNear(score, 1, 0)).toBe(0);
  });
});
