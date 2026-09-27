import { describe, expect, it } from 'vitest';
import type { NoteValue } from '../src/domain/notation/noteValue';
import type { TimeSignature } from '../src/domain/score';
import { beamLine, beamY, groupBeams, type BeamCandidate } from '../src/infrastructure/render/beams';

const FOUR_FOUR: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
const THREE_EIGHT: TimeSignature = { beat: 0, numerator: 3, denominator: 8 };

const chord = (beat: number, value: NoteValue, timeSignature = FOUR_FOUR, staff = 'treble'): BeamCandidate => {
  const barLength = (timeSignature.numerator * 4) / timeSignature.denominator;
  const bar = Math.floor(beat / barLength);
  return { staff, bar, beat, barBeat: bar * barLength, duration: { value, dots: 0 }, timeSignature };
};

describe('groupBeams', () => {
  it('beams four sixteenths of one quarter together', () => {
    const chords = [0, 0.25, 0.5, 0.75].map((b) => chord(b, 'sixteenth'));
    expect(groupBeams(chords)).toEqual([[0, 1, 2, 3]]);
  });

  it('starts a new group on each quarter in 4/4', () => {
    const chords = [0, 0.5, 1, 1.5].map((b) => chord(b, 'eighth'));
    expect(groupBeams(chords)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('beams three eighths together in 3/8', () => {
    const chords = [0, 0.25, 0.5, 0.75, 1, 1.25].map((b) => chord(b, 'sixteenth', THREE_EIGHT));
    expect(groupBeams(chords)).toEqual([[0, 1, 2, 3, 4, 5]]);
  });

  it('is split by a longer note in between', () => {
    const chords = [chord(0, 'eighth'), chord(0.5, 'quarter'), chord(1.5, 'eighth'), chord(2, 'eighth')];
    expect(groupBeams(chords)).toEqual([]);
  });

  it('never joins notes across a bar line or across staves', () => {
    const chords = [chord(3.5, 'eighth'), chord(4, 'eighth'), chord(0, 'eighth', FOUR_FOUR, 'bass'), chord(0.5, 'eighth')];
    expect(groupBeams(chords)).toEqual([]);
  });

  it('leaves a lone eighth with its flag', () => {
    expect(groupBeams([chord(0, 'eighth')])).toEqual([]);
  });
});

describe('beamLine', () => {
  const sizes = { stem: 35, minStem: 25, maxRise: 10 };

  it('is flat over notes at the same height', () => {
    const line = beamLine([{ x: 0, noteY: 100 }, { x: 50, noteY: 100 }], true, sizes);
    expect(line.slope).toBe(0);
    expect(line.y0).toBe(65); // a normal stem above the notes
  });

  it('follows the melody but tilts no more than maxRise', () => {
    const line = beamLine([{ x: 0, noteY: 100 }, { x: 50, noteY: 40 }], true, sizes);
    expect(beamY(line, 50) - beamY(line, 0)).toBe(-10);
  });

  it('keeps short beams from getting steep', () => {
    const line = beamLine([{ x: 0, noteY: 100 }, { x: 20, noteY: 60 }], true, sizes);
    expect(Math.abs(line.slope)).toBeLessThanOrEqual(0.25);
  });

  it('moves away from the notes so no stem gets too short', () => {
    // The middle note is much higher: its stem would be too short on a straight line between the ends.
    const points = [{ x: 0, noteY: 100 }, { x: 25, noteY: 70 }, { x: 50, noteY: 100 }];
    const line = beamLine(points, true, sizes);
    expect(70 - beamY(line, 25)).toBeGreaterThanOrEqual(25);
  });

  it('hangs below the notes when stems go down', () => {
    const line = beamLine([{ x: 0, noteY: 40 }, { x: 50, noteY: 40 }], false, sizes);
    expect(line.y0).toBe(75);
  });
});
