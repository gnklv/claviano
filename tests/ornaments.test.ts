import { describe, expect, it } from 'vitest';
import { arpeggioDelays, neighbour, playOrnament, playTremolo, playTremoloBetween, QUICK_BEATS } from '../src/domain/notation/ornaments';

/** C5 with D5 above and B4 below. */
const C = 72;
const D = 74;
const B = 71;
const pitches = (played: { pitch: number }[]) => played.map((p) => p.pitch);
const total = (played: { offset: number; beats: number }[]) => played[played.length - 1].offset + played[played.length - 1].beats;

describe('neighbour', () => {
  const c5 = { letter: 0, octave: 5, alteration: 0 } as const;
  const b4 = { letter: 6, octave: 4, alteration: 0 } as const;

  it('is the next note of the key, above or below', () => {
    expect(neighbour(c5, 1, 0, null)).toBe(D);
    expect(neighbour(c5, -1, 0, null)).toBe(B);
    expect(neighbour(b4, 1, 0, null)).toBe(C); // across the octave
    // In D major the note above B is C sharp; in F major the note below C is B flat.
    expect(neighbour(b4, 1, 2, null)).toBe(73);
    expect(neighbour(c5, -1, -1, null)).toBe(70);
  });

  it('follows the accidental printed with the ornament', () => {
    expect(neighbour(c5, 1, 0, 'flat')).toBe(73);
    expect(neighbour(b4, 1, 2, 'natural')).toBe(C);
  });
});

describe('playOrnament', () => {
  it('trills between the note and the one above for its whole length, ending on the note', () => {
    const played = playOrnament('trill', C, 1, D, B);
    expect(pitches(played)).toEqual([C, D, C, D, C, D, C]);
    expect(played[1]).toEqual({ pitch: D, offset: QUICK_BEATS, beats: QUICK_BEATS });
    expect(played[6].beats).toBeCloseTo(0.25); // the last note takes what is left
    expect(total(played)).toBeCloseTo(1);
  });

  it('fits a trill into a very short note', () => {
    const played = playOrnament('trill', C, 0.25, D, B);
    expect(pitches(played)).toEqual([C, D, C]);
    expect(total(played)).toBeCloseTo(0.25);
  });

  it('plays a mordent down and back, an inverted one up and back, then holds the note', () => {
    expect(pitches(playOrnament('mordent', C, 1, D, B))).toEqual([C, B, C]);
    const inverted = playOrnament('inverted-mordent', C, 1, D, B);
    expect(pitches(inverted)).toEqual([C, D, C]);
    expect(inverted[2]).toEqual({ pitch: C, offset: 0.25, beats: 0.75 });
  });

  it('plays a turn from above, an inverted one from below', () => {
    const turn = playOrnament('turn', C, 1, D, B);
    expect(pitches(turn)).toEqual([D, C, B, C]);
    expect(turn.map((p) => p.beats)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(pitches(playOrnament('inverted-turn', C, 1, D, B))).toEqual([B, C, D, C]);
    // On a long note the turn is quick and the note is held after it.
    expect(playOrnament('turn', C, 4, D, B)[3]).toEqual({ pitch: C, offset: 0.75, beats: 3.25 });
  });

  it('holds the note for half its length before a delayed turn', () => {
    const played = playOrnament('delayed-turn', C, 2, D, B);
    expect(pitches(played)).toEqual([C, D, C, B, C]);
    expect(played[0]).toEqual({ pitch: C, offset: 0, beats: 1 });
    expect(played[1].offset).toBe(1);
    expect(total(played)).toBeCloseTo(2);
  });
});

describe('tremolo', () => {
  it('repeats one note: eighths for one stroke, thirty-seconds for three', () => {
    expect(playTremolo(C, 2, 1).map((p) => p.beats)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(playTremolo(C, 1, 3)).toHaveLength(8);
  });

  it('plays two notes in turn, as often one as the other', () => {
    const played = playTremoloBetween(2, 2);
    expect(played.map((p) => p.second)).toEqual([false, true, false, true, false, true, false, true]);
    expect(played[7]).toEqual({ second: true, offset: 1.75, beats: 0.25 });
  });
});

describe('arpeggioDelays', () => {
  it('brings the notes of a rolled chord in one after another, quickly', () => {
    expect(arpeggioDelays(4, 2)).toEqual([0, 0.0625, 0.125, 0.1875]);
  });

  it('keeps the roll within the first half of a short chord', () => {
    expect(arpeggioDelays(5, 0.25)[4]).toBeCloseTo(0.125);
    expect(arpeggioDelays(1, 1)).toEqual([0]);
  });
});
