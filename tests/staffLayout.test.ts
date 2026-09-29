import { describe, expect, it } from 'vitest';
import { createScore } from '../src/domain/score';
import {
  barPosition,
  beatPosition,
  cancelledSteps,
  keySignatureSteps,
  beatAtPosition,
  signatureChanges,
  tapeBars,
} from '../src/infrastructure/render/staffLayout';

/** Bars at 0, 2 and 4 seconds; the last one ends at 5 seconds (it is shorter). */
const score = createScore(
  'test',
  [{ pitch: 60, start: 0, duration: 5, beat: 0, beats: 5, velocity: 1, hand: 'right' }],
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

describe('beatAtPosition', () => {
  it('finds the beat at a place on the tape within a printed bar', () => {
    expect(beatAtPosition(score, 1, 1.5)).toBe(6);
  });

  it('keeps to the bar: a place before its first beat is its first beat', () => {
    // Bar lines stand a little before the first beat: a click there means the bar after the line.
    expect(beatAtPosition(score, 1, 0.98)).toBe(4);
  });

  it('is the inverse of beatPosition', () => {
    expect(beatAtPosition(score, 1, beatPosition(score, 1, 5.5))).toBeCloseTo(5.5);
  });
});

describe('keySignatureSteps', () => {
  it('has no accidentals in Do major / La minor', () => {
    expect(keySignatureSteps(0, 'treble')).toEqual([]);
  });

  it('places sharps Fa, Do, Sol on the treble staff', () => {
    // Fa5 on the top line, Do5 in the third space, Sol5 just above the staff
    expect(keySignatureSteps(3, 'treble')).toEqual([0, 3, -1]);
  });

  it('places flats Si, Mi on the treble staff', () => {
    // Si4 on the middle line, Mi5 in the top space
    expect(keySignatureSteps(-2, 'treble')).toEqual([4, 1]);
  });

  it('puts the bass staff accidentals a third lower', () => {
    expect(keySignatureSteps(1, 'bass')).toEqual([2]); // Fa3 on the second line from the top
    expect(keySignatureSteps(-1, 'bass')).toEqual([6]); // Si2 on the second line from the bottom
  });

  it('has at most seven accidentals', () => {
    expect(keySignatureSteps(7, 'treble')).toHaveLength(7);
    expect(keySignatureSteps(-7, 'bass')).toHaveLength(7);
  });
});

describe('tapeBars', () => {
  // Für Elise-like: 3/8 (1.5 quarters) with a pickup of one eighth (0.5 quarters). 60 BPM.
  const pickup = createScore(
    'test',
    [{ pitch: 76, start: 0, duration: 3.5, beat: 0, beats: 3.5, velocity: 1, hand: 'right' }],
    [0, 0.5, 2],
    { barBeats: [0, 0.5, 2], timeSignatures: [{ beat: 0, numerator: 3, denominator: 8 }] },
  );

  it('makes a pickup as wide as the part of the bar it fills', () => {
    const { starts, widths } = tapeBars(pickup);
    expect(widths[0]).toBeCloseTo(1 / 3);
    expect(widths[1]).toBe(1);
    expect(starts[1]).toBeCloseTo(1 / 3);
  });

  it('places time and beats consistently on the narrower bar', () => {
    expect(barPosition(pickup, 0.25)).toBeCloseTo(1 / 6); // half-way through the pickup
    expect(beatPosition(pickup, 0, 0.25)).toBeCloseTo(1 / 6);
    expect(beatPosition(pickup, 1, 1.25)).toBeCloseTo(1 / 3 + 0.5);
  });

  it('leaves full bars one unit wide', () => {
    expect(tapeBars(score).widths).toEqual([1, 1, 1]);
  });

  it('narrows a last bar the music does not fill, as when it completes a pickup', () => {
    const shortEnd = createScore(
      'test',
      [{ pitch: 76, start: 0, duration: 3, beat: 0, beats: 3, velocity: 1, hand: 'right' }],
      [0, 0.5, 2],
      { barBeats: [0, 0.5, 2], timeSignatures: [{ beat: 0, numerator: 3, denominator: 8 }] },
    );
    expect(tapeBars(shortEnd).widths[2]).toBeCloseTo(2 / 3);
  });
});

describe('cancelledSteps', () => {
  it('cancels every old accidental when the kind changes or the key becomes Do major', () => {
    expect(cancelledSteps(-3, 2, 'treble')).toEqual(keySignatureSteps(-3, 'treble'));
    expect(cancelledSteps(1, 0, 'bass')).toEqual(keySignatureSteps(1, 'bass'));
  });

  it('cancels only what the new key drops', () => {
    expect(cancelledSteps(-3, -1, 'treble')).toEqual(keySignatureSteps(-3, 'treble').slice(1));
    expect(cancelledSteps(-1, -2, 'treble')).toEqual([]);
    expect(cancelledSteps(0, 3, 'treble')).toEqual([]);
  });
});

describe('signatureChanges', () => {
  it('finds key and time changes by printed bar, leaving out the opening signatures', () => {
    const changing = createScore(
      'test',
      [{ pitch: 60, start: 0, duration: 12, beat: 0, beats: 12, velocity: 1, hand: 'right' }],
      [0, 4, 8],
      {
        barBeats: [0, 4, 8],
        keySignatures: [
          { beat: 0, fifths: 1, minor: false },
          { beat: 4, fifths: -2, minor: false },
        ],
        timeSignatures: [
          { beat: 0, numerator: 4, denominator: 4 },
          { beat: 8, numerator: 3, denominator: 4 },
        ],
      },
    );
    expect(signatureChanges(changing)).toEqual([
      { bar: 1, key: { from: 1, to: -2 }, time: null },
      { bar: 2, key: null, time: { beat: 8, numerator: 3, denominator: 4 } },
    ]);
  });
});
