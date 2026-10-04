import { describe, expect, it } from 'vitest';
import type { NoteValue } from '../src/domain/notation/noteValue';
import type { TimeSignature } from '../src/domain/score';
import { groupBeams, type BeamCandidate } from '../src/domain/notation/beaming';
import { avoidNotes, beamLine, beamY, kneeBeamLine } from '../src/infrastructure/render/beams';

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

describe('kneeBeamLine', () => {
  it('follows the melody down, half as steeply, in the middle of the gap', () => {
    // Treble notes at y 40 and 50 (stems down) going down to a bass note at y 100 (stem up).
    const points = [
      { x: 0, noteY: 40, stemUp: false },
      { x: 10, noteY: 50, stemUp: false },
      { x: 20, noteY: 100, stemUp: true },
    ];
    const line = kneeBeamLine(points, 10);
    expect(line.slope).toBe(1.5); // the melody falls 60 over 20: 3, halved
    // Room: at least 60 under the second note, at most 90 over the bass note — the middle of it.
    expect(beamY(line, 10) - 50).toBeGreaterThanOrEqual(10);
    expect(100 - beamY(line, 20)).toBeGreaterThanOrEqual(10);
  });

  it('lies level between the notes when a slant leaves no room', () => {
    // A bass note at y 100 (stem up), then down-stem notes at 80 and 40.
    const line = kneeBeamLine(
      [
        { x: 0, noteY: 100, stemUp: true },
        { x: 10, noteY: 80, stemUp: false },
        { x: 20, noteY: 40, stemUp: false },
      ],
      10,
    );
    expect(line.slope).toBe(0);
    expect(line.y0).toBe(90); // under the note at 80, over the bass note at 100
  });
});

describe('avoidNotes', () => {
  // An up-stem beam over notes at y 100, its outer edge at y 60 (stems of 40), 6 thick.
  const line = { x0: 0, y0: 60, slope: 0 };
  const points = [
    { x: 0, noteY: 100 },
    { x: 20, noteY: 100 },
  ];
  const options = { band: 6, clearance: 2, shortestStem: 20 };

  it('leaves a beam alone when no other note is in its way', () => {
    expect(avoidNotes(line, points, true, [{ x: 10, top: 20, bottom: 30 }], options)).toBe(line);
  });

  it('moves towards its own notes, shortening the stems, when that clears the other voice', () => {
    // A head from 55 to 65 sits on the beam: move down until the beam starts at 67.
    expect(avoidNotes(line, points, true, [{ x: 10, top: 55, bottom: 65 }], options).y0).toBe(67);
  });

  it('moves past the other voice when the stems would get too short', () => {
    // Clearing a head from 64 to 82 below would leave 16-long stems: go above it instead.
    expect(avoidNotes(line, points, true, [{ x: 10, top: 64, bottom: 82 }], options).y0).toBe(56);
  });
});
