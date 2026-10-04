import { describe, expect, it } from 'vitest';
import type { Notation, NotatedNote } from '../src/domain/notation/notation';
import { performNotation } from '../src/domain/notation/performance';

/*
 * Notation written out by hand, with no file format in sight: what a reader of any format hands
 * to the domain, and what the domain makes of it.
 */

/** A printed note in the treble clef: middle Do is letter 0, octave 4, MIDI 60. */
const note = (letter: 0 | 1 | 2 | 3 | 4 | 5 | 6, beat: number, beats: number, more: Partial<NotatedNote> = {}): NotatedNote => ({
  staff: 1,
  voice: '1',
  hand: 'right',
  chord: false,
  clef: 'treble',
  pitch: { letter, octave: 4, alteration: 0 },
  beat,
  beats,
  duration: { value: beats >= 2 ? 'half' : 'quarter', dots: 0 },
  tuplet: null,
  tupletStart: null,
  tupletStop: false,
  accidental: null,
  stem: null,
  beams: [],
  tieStart: false,
  tieStop: false,
  articulations: [],
  fermata: null,
  slurs: [],
  ornaments: [],
  trillLine: false,
  tremolo: null,
  arpeggio: null,
  bar: Math.floor(beat / 4),
  sounding: 60 + [0, 2, 4, 5, 7, 9, 11][letter],
  dynamics: null,
  ...more,
});

const notation = (notes: NotatedNote[], more: Partial<Notation> = {}): Notation => ({
  title: 'By hand',
  bars: Array.from({ length: Math.floor(Math.max(...notes.map((n) => n.beat)) / 4) + 1 }, (_, i) => ({ start: i * 4, length: 4, navigation: {} })),
  notes,
  graces: [],
  rests: [],
  clefs: [],
  keySignatures: [],
  timeSignatures: [],
  tempos: [{ bar: 0, beat: 0, bpm: 60 }],
  tempoMarks: [],
  pedalMoves: [],
  pedalMarks: [],
  octaveShifts: [],
  dynamics: [],
  hairpins: [],
  dynamicLevels: [],
  ...more,
});

describe('performNotation', () => {
  it('plays the notes where they are written; at 60 a quarter lasts a second', () => {
    const score = performNotation(notation([note(0, 0, 1), note(1, 1, 1), note(2, 2, 2)]));
    expect(score.title).toBe('By hand');
    expect(score.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 1],
      [62, 1, 1],
      [64, 2, 2],
    ]);
    // The notation is kept beside the notes, now with the time each first sounds.
    expect(score.written!.map((n) => [n.beat, n.start, n.end])).toEqual([
      [0, 0, 1],
      [1, 1, 2],
      [2, 2, 4],
    ]);
  });

  it('joins tied notes into one, and plays a staccato note for half its length', () => {
    const score = performNotation(
      notation([note(0, 0, 2, { tieStart: true }), note(0, 2, 2, { tieStop: true }), note(1, 4, 1, { articulations: ['staccato'] })]),
    );
    expect(score.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 4],
      [62, 4, 0.5],
    ]);
  });

  it('plays a repeated bar twice, the page keeping it once', () => {
    const score = performNotation(
      notation([note(0, 0, 4), note(1, 4, 4)], {
        bars: [
          { start: 0, length: 4, navigation: { repeatEnd: { times: 2 } } },
          { start: 4, length: 4, navigation: {} },
        ],
      }),
    );
    expect(score.notes.map((n) => [n.pitch, n.start])).toEqual([
      [60, 0],
      [60, 4],
      [62, 8],
    ]);
    expect(score.barWritten).toEqual([0, 0, 1]);
    expect(score.written).toHaveLength(2);
  });

  it('plays louder after a forte mark, and holds a note under a fermata twice as long', () => {
    const score = performNotation(
      notation([note(0, 0, 1), note(1, 1, 1), note(2, 2, 2, { fermata: 'upright' })], {
        dynamicLevels: [
          { beat: 0, level: 40 },
          { beat: 1, level: 110 },
        ],
      }),
    );
    expect(score.notes[1].velocity).toBeGreaterThan(score.notes[0].velocity * 2);
    expect(score.notes[2]).toMatchObject({ start: 2, duration: 4 });
  });

  it('plays a trill by the key: in one sharp the note above Mi is Fa sharp', () => {
    const trill = { kind: 'trill', accidentalAbove: null, accidentalBelow: null, below: false } as const;
    const score = performNotation(notation([note(2, 0, 0.5, { ornaments: [trill] })], { keySignatures: [{ beat: 0, fifths: 1, minor: false }] }));
    expect(score.notes.map((n) => n.pitch)).toEqual([64, 66, 64]);
  });

  it('brings in the note after an appoggiatura, which takes half of it', () => {
    const grace = { staff: 1, hand: 'right', clef: 'treble', pitch: { letter: 1, octave: 4, alteration: 0 }, accidental: null, chord: false, slash: false, value: 'eighth', slur: false, sounding: 62 } as const;
    const score = performNotation(notation([note(0, 0, 2)], { graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace] }] }));
    expect(score.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [62, 0, 1],
      [60, 1, 1],
    ]);
    expect(score.graces).toMatchObject([{ bar: 0, beat: 0, soundBeat: 0, soundBeats: 1 }]);
  });

  it('holds notes under the pedal marks, by the tempo', () => {
    const score = performNotation(
      notation([note(0, 0, 4)], {
        pedalMoves: [
          { bar: 0, pedal: 'sustain', beat: 1, down: true },
          { bar: 0, pedal: 'sustain', beat: 3, down: false },
        ],
      }),
    );
    expect(score.pedal).toEqual([{ start: 1, end: 3 }]);
  });
});
