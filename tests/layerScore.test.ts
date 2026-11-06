import { describe, expect, it } from 'vitest';
import { scoreForLayer } from '../src/domain/practice/layerScore';
import { performNotation } from '../src/domain/notation/performance';
import { transcribed } from '../src/domain/notation/transcription';
import { createScore, type Score } from '../src/domain/score';
import type { NoteSource } from '../src/domain/note';
import { grace, notation, played, written } from './layerScoreFixtures';

const part = { from: 0, to: 0 };

describe('a written layer as its original performance', () => {
  it('filters original note objects while preserving the complete score timeline and notation', () => {
    const score = performNotation(notation([written(0, 72), written(1, 74), written(4, 76)], {
      pedalMoves: [{ bar: 0, beat: 0, pedal: 'sustain', down: true }, { bar: 1, beat: 4, pedal: 'sustain', down: false }],
    }));
    const before = JSON.stringify(score);
    const result = scoreForLayer(score, part, { kind: 'lead', notes: [1] });
    expect(result).toEqual({ ...score, notes: [score.notes[1]] });
    expect(result.notes[0]).toBe(score.notes[1]);
    for (const field of ['bars', 'barBeats', 'barWritten', 'timeMap', 'pedal', 'notation', 'graceSounds'] as const) {
      expect(result[field]).toBe(score[field]);
    }
    expect(JSON.stringify(score)).toBe(before);
  });

  it('retains an entering tie attack from before the Part with its original length', () => {
    const score = performNotation(notation([
      written(3, 72, { tieStart: true }), written(4, 72, { tieStop: true }), written(5, 74),
    ]));
    const result = scoreForLayer(score, { from: 1, to: 1 }, { kind: 'lead', notes: [1] });
    expect(result.notes).toEqual([score.notes[0]]);
    expect(result.notes[0]).toMatchObject({ start: 3, duration: 2 });
    expect(result.notes[0]).toBe(score.notes[0]);
  });

  it('selects every performance of a written note using its source through repeats', () => {
    const score = performNotation(notation([written(0, 72), written(4, 74)], {
      bars: [
        { start: 0, length: 4, navigation: { repeatStart: true } },
        { start: 4, length: 4, navigation: { repeatEnd: { times: 2 } } },
      ],
    }));
    const result = scoreForLayer(score, part, { kind: 'full', notes: [0] });
    expect(result.notes).toEqual([score.notes[0], score.notes[2]]);
    expect(result.notes.map((note) => note.start)).toEqual([0, 8]);
    expect(result.duration).toBe(score.duration);
  });

  it('keeps original ornament and tremolo pieces and the delayed top of a rolled chord', () => {
    const score = performNotation(notation([
      written(0, 64, { ornaments: [{ kind: 'trill', accidentalAbove: null, accidentalBelow: null, below: false }] }),
      written(1, 67, { tremolo: { type: 'single', strokes: 1 } }),
      written(2, 60, { arpeggio: 'up' }), written(2, 72, { chord: true, arpeggio: 'up' }),
    ]));
    const result = scoreForLayer(score, part, { kind: 'lead', notes: [0, 1, 3] });
    expect(result.notes).toEqual(score.notes.filter((note) => note.pitch !== 60));
    expect(result.notes.every((note) => score.notes.includes(note))).toBe(true);
    expect(result.notes.at(-1)).toMatchObject({ pitch: 72, start: 2.0625, duration: 0.9375 });
  });

  it('keeps a grace group when the selected note is the top of its anchored chord', () => {
    const score = performNotation(notation([
      written(0, 60), written(0, 72, { chord: true }), written(1, 74),
    ], { graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(67), grace(69, { chord: true })] }] }));
    const result = scoreForLayer(score, part, { kind: 'lead', notes: [1] });
    expect(result.notes.map((note) => note.pitch)).toEqual([67, 69, 72]);
    expect(result.notes.every((note) => score.notes.includes(note))).toBe(true);
    expect(result.notes.at(-1)?.start).toBeGreaterThan(0);
  });

  it('does not attach graces to a different staff, voice, onset, or separate chord', () => {
    const score = performNotation(notation([
      written(0, 60), written(0, 72, { chord: true }),
      written(0, 79, { chord: true, voice: '2' }),
      written(0, 81, { chord: true, staff: 2 }),
      written(0, 84), written(0, 86, { chord: true }), written(1, 88, { chord: true }),
    ], { graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(67)] }] }));
    for (const index of [2, 3, 4, 5, 6]) {
      const result = scoreForLayer(score, part, { kind: 'lead', notes: [index] });
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].pitch).toBe(score.notation.notes[index].sounding);
    }
  });

  it('keeps unattached graces only in full and only in their written Part', () => {
    const score = performNotation(notation([written(0, 72), written(4, 74)], {
      graces: [
        { bar: 0, beat: 4, leadsTo: null, notes: [grace(67)] },
        { bar: 1, beat: 8, leadsTo: null, notes: [grace(69)] },
      ],
    }));
    expect(scoreForLayer(score, part, { kind: 'lead', notes: [0] }).notes.map((note) => note.pitch)).toEqual([72]);
    expect(scoreForLayer(score, part, { kind: 'full', notes: [0] }).notes.map((note) => note.pitch)).toEqual([72, 67]);
  });

  it('does not pull an anchored grace group from a preceding Part', () => {
    const score = performNotation(notation([written(0, 60), written(4, 72)], {
      graces: [{ bar: 0, beat: 4, leadsTo: 1, notes: [grace(67)] }],
    }));
    expect(scoreForLayer(score, { from: 1, to: 1 }, { kind: 'full', notes: [1] }).notes.map((note) => note.pitch)).toEqual([72]);
  });

  it('preserves the exact MIDI timing and velocity despite quantization and written reordering', () => {
    const score = transcribed(createScore('MIDI', [
      played(72, 0.01, 0.02), played(48, 0.02, 0.03, { hand: 'left' }), played(76, 0.03, 0.04),
    ], [0]));
    const result = scoreForLayer(score, part, { kind: 'lead', notes: [1] });
    expect(result.notes).toEqual([score.notes[2]]);
    expect(result.notes[0]).toBe(score.notes[2]);
    expect(result.notes[0]).toMatchObject({ start: 0.03, beat: 0.04, duration: 0.23, beats: 0.47, velocity: 0.71 });
    expect(scoreForLayer(score, part, { kind: 'full', notes: [0, 1, 2] }).notes).toEqual(score.notes);
  });

  it('rejects invalid Parts, foreign note indices, and a partial mask mislabeled full', () => {
    const score = performNotation(notation([written(0, 72), written(1, 74), written(4, 76)]));
    for (const invalid of [{ from: -1, to: 0 }, { from: 1, to: 0 }, { from: 0, to: 2 }, { from: 0.5, to: 1 }]) {
      expect(() => scoreForLayer(score, invalid, { kind: 'lead', notes: [0] })).toThrow(RangeError);
    }
    for (const indices of [[-1], [0.5], [3], [2]]) {
      expect(() => scoreForLayer(score, part, { kind: 'lead', notes: indices })).toThrow(RangeError);
    }
    expect(() => scoreForLayer(score, part, { kind: 'full', notes: [0] })).toThrow(RangeError);
  });

  it('rejects legacy or incomplete source metadata even on events the layer would omit', () => {
    const score = performNotation(notation([written(0, 72), written(1, 74)]));
    for (const sources of [undefined, []]) {
      const unmapped: Score = { ...score, notes: [score.notes[0], { ...score.notes[1], sources }] };
      expect(() => scoreForLayer(unmapped, part, { kind: 'lead', notes: [0] })).toThrow(/source/i);
    }
    expect(() => scoreForLayer(createScore('Legacy', [played(72, 0, 0)], [0]), part, { kind: 'lead', notes: [] })).toThrow(/source/i);
  });

  it('rejects source references to missing or fractional written notes and graces', () => {
    const score = performNotation(notation([written(0, 72)], { graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(67)] }] }));
    const invalid: NoteSource[][] = [
      [{ kind: 'note', index: -1 }], [{ kind: 'note', index: 1 }], [{ kind: 'note', index: 0.5 }],
      [{ kind: 'grace', group: 1, index: 0 }], [{ kind: 'grace', group: 0, index: 1 }], [{ kind: 'grace', group: 0.5, index: 0 }],
    ];
    for (const sources of invalid) {
      expect(() => scoreForLayer({ ...score, notes: [{ ...score.notes[0], sources }] }, part, { kind: 'lead', notes: [0] })).toThrow(RangeError);
    }
  });
});
