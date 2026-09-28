import { describe, expect, it } from 'vitest';
import { createScore } from '../src/domain/score';
import { barPosition, beatPosition, keySignatureSteps, pageAt, tapeBars } from '../src/infrastructure/render/staffLayout';

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

describe('pageAt', () => {
  it('finds the printed bar and the beat at a place on the tape', () => {
    expect(pageAt(score, 1.5, 1.5)).toEqual({ bar: 1, beat: 6 });
  });

  it('counts the gap before a bar line to the bar after it, at its first beat', () => {
    // Bar lines stand a little before the first beat: the caller shifts the bar lookup.
    expect(pageAt(score, 1.02, 0.98)).toEqual({ bar: 1, beat: 4 });
  });

  it('is nothing before the tape starts or after it ends', () => {
    expect(pageAt(score, -0.1, -0.1)).toBeNull();
    expect(pageAt(score, 9, 9)).toBeNull();
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
