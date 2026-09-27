import { describe, expect, it } from 'vitest';
import { createScore } from '../src/domain/score';
import { barPosition, keySignatureSteps } from '../src/infrastructure/render/staffLayout';

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
