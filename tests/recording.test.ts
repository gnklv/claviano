import { describe, expect, it } from 'vitest';
import { scoreFromTake, type PlayedNote, type TakeBeat } from '../src/domain/notation/recording';

/* A take written down as a piece. At 60 beats a minute a quarter note is a second. */

const FOUR_FOUR: TakeBeat = { tempo: 60, numerator: 4, denominator: 4, beat: 1 };
const played = (pitch: number, start: number, end: number | null): PlayedNote => ({ pitch, start, end });
const write = (notes: PlayedNote[], beat = FOUR_FOUR, now = 0) => scoreFromTake('A take', notes, beat, now);
const beats = (notes: PlayedNote[], beat = FOUR_FOUR) => write(notes, beat).notes.map((note) => [note.pitch, note.beat, note.beats]);

describe('a take written down', () => {
  it('sets each note on the nearest sixteenth, and makes it last to the nearest sixteenth of where the key came up', () => {
    expect(
      beats([
        played(60, 0.04, 0.97),
        played(62, 1.02, 1.49),
        played(64, 1.47, 2.1),
        played(65, 2.26, 2.3),
      ]),
    ).toEqual([
      [60, 0, 1],
      [62, 1, 0.5],
      [64, 1.5, 0.5],
      // However short the key was held, a note is a sixteenth at the least.
      [65, 2.25, 0.25],
    ]);
  });

  it('plays as it is written: on the beat, a touch short of its length', () => {
    const [note] = write([played(60, 1.04, 1.97)]).notes;
    expect(note?.start).toBe(1);
    expect(note?.duration).toBeCloseTo(0.95);
  });

  it('follows the tempo: at 120 a second is two quarters', () => {
    expect(beats([played(60, 1, 1.5)], { ...FOUR_FOUR, tempo: 120 })).toEqual([[60, 2, 1]]);
  });

  it('gives the notes under middle Do to the left hand', () => {
    expect(write([played(59, 0, 1), played(60, 0, 1)]).notes.map((note) => [note.pitch, note.hand])).toEqual([
      [59, 'left'],
      [60, 'right'],
    ]);
  });

  it('is in whole bars of its time signature, to the end of the last note', () => {
    const score = write([played(60, 0, 1), played(62, 4.5, 5)]);
    expect(score.bars).toEqual([0, 4]);
    expect(score.notation.bars.map((bar) => [bar.start, bar.length])).toEqual([
      [0, 4],
      [4, 4],
    ]);
    expect(score.notation.timeSignatures).toEqual([{ beat: 0, numerator: 4, denominator: 4 }]);

    const waltz = write([played(60, 0, 1), played(62, 3.2, 4)], { tempo: 60, numerator: 3, denominator: 4, beat: 1 });
    expect(waltz.bars).toEqual([0, 3]);
  });

  it('counts dotted quarters in 6/8: at 60 a bar is two seconds, three quarters long', () => {
    const score = write([played(60, 0, 0.5), played(62, 2, 2.5)], { tempo: 60, numerator: 6, denominator: 8, beat: 1.5 });
    expect(score.bars).toEqual([0, 2]);
    expect(score.notes.map((note) => note.beat)).toEqual([0, 3]);
    expect(score.notation.tempoMarks[0]?.perMinute).toBe(90);
  });

  it('marks its tempo, and is written as notes on the staves of the two hands', () => {
    const score = write([played(48, 0, 1), played(72, 0, 1)]);
    expect(score.title).toBe('A take');
    expect(score.notation.tempoMarks).toEqual([{ beat: 0, unit: { value: 'quarter', dots: 0 }, perMinute: 60 }]);
    expect(new Set(score.notation.notes.map((note) => note.staff)).size).toBe(2);
  });

  it('writes a key still down as far as the take has got', () => {
    expect(write([played(60, 0, null)], FOUR_FOUR, 2.02).notes.map((note) => note.beats)).toEqual([2]);
  });

  it('is one empty bar when nothing was played', () => {
    const score = write([]);
    expect(score.notes).toEqual([]);
    expect(score.notation.bars).toHaveLength(1);
  });
});
