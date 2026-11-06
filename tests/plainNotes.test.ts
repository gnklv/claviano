import { describe, expect, it } from 'vitest';
import { performNotation, plainNotesOf } from '../src/domain/notation/performance';
import { transcribed } from '../src/domain/notation/transcription';
import type { OrnamentKind } from '../src/domain/notation/ornaments';
import { createScore } from '../src/domain/score';
import { grace, notation, played, written } from './layerScoreFixtures';

const mark = (kind: OrnamentKind) => ({ kind, accidentalAbove: null, accidentalBelow: null, below: false });

describe('plain written-note performance', () => {
  it.each<OrnamentKind>(['trill', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn', 'delayed-turn', 'delayed-inverted-turn'])('plays %s as its sustained principal with its original articulation and dynamics', (kind) => {
    const score = performNotation(notation([written(0, 72, { beats: 2, ornaments: [mark(kind)], articulations: ['staccato', 'accent'], dynamics: 90 })]));
    const before = JSON.stringify(score);
    const plain = plainNotesOf(score);
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatchObject({ pitch: 72, start: 0, duration: 1, beat: 0, beats: 2, velocity: score.notes[0].velocity, sources: [{ kind: 'note', index: 0 }] });
    expect(JSON.stringify(score)).toBe(before);
  });

  it('removes an appoggiatura and restores the complete anchored chord to its written onset and duration', () => {
    const score = performNotation(notation([written(0, 60, { beats: 2 }), written(0, 72, { beats: 2, chord: true })], {
      graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(64, { slash: false })] }],
    }));
    expect(score.notes.map((note) => [note.pitch, note.start, note.duration])).toEqual([[64, 0, 1], [60, 1, 1], [72, 1, 1]]);
    expect(plainNotesOf(score).map((note) => [note.pitch, note.start, note.duration])).toEqual([[60, 0, 2], [72, 0, 2]]);
  });

  it('removes crushed grace chords and unattached graces without adding them to principal sources', () => {
    const score = performNotation(notation([written(1, 72)], {
      graces: [
        { bar: 0, beat: 1, leadsTo: 0, notes: [grace(67), grace(69, { chord: true })] },
        { bar: 0, beat: 4, leadsTo: null, notes: [grace(74)] },
      ],
    }));
    expect(plainNotesOf(score)).toMatchObject([{ pitch: 72, start: 1, duration: 1, sources: [{ kind: 'note', index: 0 }] }]);
  });

  it('uses original played bar occurrences and the original clock instead of regenerating navigation or tempo', () => {
    const source = performNotation(notation([written(0, 72, { ornaments: [mark('turn')] }), written(4, 74)]));
    const score = { ...source, barWritten: [0, 1, 0], barBeats: [0, 4, 8], bars: [0, 10, 20], duration: 30, timeMap: [{ beat: 0, time: 0 }, { beat: 12, time: 30 }] };
    expect(plainNotesOf(score).map((note) => [note.pitch, note.start, note.duration, note.sources])).toEqual([
      [72, 0, 2.5, [{ kind: 'note', index: 0 }]], [74, 10, 2.5, [{ kind: 'note', index: 1 }]], [72, 20, 2.5, [{ kind: 'note', index: 0 }]],
    ]);
  });

  it('keeps tied source unions separate across first and second endings', () => {
    const score = performNotation(notation([
      written(0, 72, { beats: 4, ornaments: [mark('trill')], tieStart: true }),
      written(4, 72, { beats: 4, tieStop: true }), written(8, 72, { beats: 4, tieStop: true }),
    ], { bars: [
      { start: 0, length: 4, navigation: { repeatStart: true } },
      { start: 4, length: 4, navigation: { ending: [1], repeatEnd: { times: 2 } } },
      { start: 8, length: 4, navigation: { ending: [2] } },
    ] }));
    expect(plainNotesOf(score).map((note) => [note.start, note.duration, note.sources])).toEqual([
      [0, 8, [{ kind: 'note', index: 0 }, { kind: 'note', index: 1 }]],
      [8, 8, [{ kind: 'note', index: 0 }, { kind: 'note', index: 2 }]],
    ]);
  });

  it('uses the original held time map for both the plain principal and unaffected notes', () => {
    const source = performNotation(notation([
      written(0, 72, { beats: 2, ornaments: [mark('mordent')], articulations: ['staccato'], fermata: 'upright' }),
      written(2, 74, { beats: 2 }),
    ]));
    const score = { ...source, timeMap: [{ beat: 0, time: 0, hold: true }, { beat: 2, time: 6 }, { beat: 4, time: 8 }] };
    expect(plainNotesOf(score).map((note) => [note.pitch, note.start, note.duration])).toEqual([[72, 0, 3], [74, 6, 2]]);
  });

  it('retains the original realization of tremolos and rolled chords', () => {
    const score = performNotation(notation([
      written(0, 60, { tremolo: { type: 'single', strokes: 1 } }),
      written(1, 64, { ornaments: [mark('turn')] }),
      written(2, 60, { arpeggio: 'up' }), written(2, 72, { chord: true, arpeggio: 'up' }),
      written(4, 67, { tremolo: { type: 'start', strokes: 1 } }), written(5, 79, { tremolo: { type: 'stop', strokes: 1 } }),
    ]));
    const unaffected = (notes: typeof score.notes) => notes.filter((note) => !note.sources?.some((source) => source.kind === 'note' && source.index === 1));
    expect(unaffected(plainNotesOf(score))).toEqual(unaffected(score.notes));
  });

  it('returns the exact performance array for MIDI and other scores without supported decorations', () => {
    const score = transcribed(createScore('MIDI', [played(72, 0.023, 0.017)], [0]));
    expect(plainNotesOf(score)).toBe(score.notes);
    const tremolo = performNotation(notation([written(0, 72, { tremolo: { type: 'single', strokes: 1 } })]));
    expect(plainNotesOf(tremolo)).toBe(tremolo.notes);
  });

  it('rejects absent or invalid provenance before simplifying a decorated score', () => {
    const score = performNotation(notation([written(0, 72, { ornaments: [mark('trill')] })]));
    expect(() => plainNotesOf({ ...score, notes: score.notes.map(({ sources: _, ...note }) => note) })).toThrow(/source/i);
    expect(() => plainNotesOf({ ...score, notes: [{ ...score.notes[0], sources: [{ kind: 'note', index: 99 }] }] })).toThrow(RangeError);
  });
});
