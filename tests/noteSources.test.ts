import { describe, expect, it } from 'vitest';
import { performNotation } from '../src/domain/notation/performance';
import { transcribed } from '../src/domain/notation/transcription';
import { createScore } from '../src/domain/score';
import { grace, notation, played, written } from './layerScoreFixtures';

describe('played-note sources', () => {
  it('keeps each written source through an ordinary note, a trill, a tremolo, and a rolled chord', () => {
    const score = performNotation(notation([
      written(0, 60),
      written(1, 64, { ornaments: [{ kind: 'trill', accidentalAbove: null, accidentalBelow: null, below: false }] }),
      written(2, 67, { tremolo: { type: 'single', strokes: 1 } }),
      written(3, 60, { arpeggio: 'up' }), written(3, 72, { chord: true, arpeggio: 'up' }),
    ]));
    expect(score.notes.map((note) => note.sources)).toEqual([
      [{ kind: 'note', index: 0 }],
      ...Array.from({ length: 7 }, () => [{ kind: 'note', index: 1 }]),
      ...Array.from({ length: 2 }, () => [{ kind: 'note', index: 2 }]),
      [{ kind: 'note', index: 3 }], [{ kind: 'note', index: 4 }],
    ]);
    expect(score.notes.map((note) => [note.start, note.duration])).toEqual([
      [0, 1], [1, 0.125], [1.125, 0.125], [1.25, 0.125], [1.375, 0.125],
      [1.5, 0.125], [1.625, 0.125], [1.75, 0.25], [2, 0.5], [2.5, 0.5],
      [3, 1], [3.0625, 0.9375],
    ]);
  });

  it('keeps the originating side of a tremolo between two notes', () => {
    const score = performNotation(notation([
      written(0, 60, { tremolo: { type: 'start', strokes: 1 } }),
      written(1, 72, { tremolo: { type: 'stop', strokes: 1 } }),
    ]));
    expect(score.notes.map((note) => [note.pitch, note.start, note.duration, note.sources])).toEqual([
      [60, 0, 0.5, [{ kind: 'note', index: 0 }]], [72, 0.5, 0.5, [{ kind: 'note', index: 1 }]],
      [60, 1, 0.5, [{ kind: 'note', index: 0 }]], [72, 1.5, 0.5, [{ kind: 'note', index: 1 }]],
    ]);
  });

  it('unites tied origins separately on each pass through different endings', () => {
    const source = notation([
      written(0, 72, { beats: 4, tieStart: true }),
      written(4, 72, { beats: 4, tieStop: true }),
      written(8, 72, { beats: 4, tieStop: true }),
    ], { bars: [
      { start: 0, length: 4, navigation: { repeatStart: true } },
      { start: 4, length: 4, navigation: { ending: [1], repeatEnd: { times: 2 } } },
      { start: 8, length: 4, navigation: { ending: [2] } },
    ] });
    const before = JSON.stringify(source);
    const score = performNotation(source);
    expect(score.barWritten).toEqual([0, 1, 0, 2]);
    expect(score.notes.map((note) => [note.start, note.duration, note.sources])).toEqual([
      [0, 8, [{ kind: 'note', index: 0 }, { kind: 'note', index: 1 }]],
      [8, 8, [{ kind: 'note', index: 0 }, { kind: 'note', index: 2 }]],
    ]);
    expect(score.notes[0].sources).not.toBe(score.notes[1].sources);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('identifies grace groups and individual notes separately on every repeat', () => {
    const score = performNotation(notation([written(0, 72, { beats: 4 })], {
      bars: [{ start: 0, length: 4, navigation: { repeatEnd: { times: 2 } } }],
      graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(67), grace(69, { chord: true })] }],
    }));
    expect(score.notes.map((note) => note.sources)).toEqual([
      [{ kind: 'grace', group: 0, index: 0 }], [{ kind: 'grace', group: 0, index: 1 }], [{ kind: 'note', index: 0 }],
      [{ kind: 'grace', group: 0, index: 0 }], [{ kind: 'grace', group: 0, index: 1 }], [{ kind: 'note', index: 0 }],
    ]);
  });

  it('maps transcribed notes back through written chord reordering without changing the performance', () => {
    const original = createScore('MIDI', [
      played(72, 0.01, 0.02), played(48, 0.02, 0.03, { hand: 'left', velocity: 0.4 }),
      played(76, 0.03, 0.04, { duration: 0.19 }), played(74, 0.52, 1.02),
    ], [0]);
    const result = transcribed(original);
    expect(result.notation.notes.map((note) => note.sounding)).toEqual([72, 76, 48, 74]);
    expect(result.notes.map((note) => note.sources)).toEqual([
      [{ kind: 'note', index: 0 }], [{ kind: 'note', index: 2 }],
      [{ kind: 'note', index: 1 }], [{ kind: 'note', index: 3 }],
    ]);
    expect(result.notes.map(({ sources: _, ...note }) => note)).toEqual(original.notes);
    expect(result.notes[0].beat).not.toBe(result.notation.notes[0].beat);
  });
});
