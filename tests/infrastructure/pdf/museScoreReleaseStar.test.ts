import { expect, test } from 'vitest';
import type { Notation } from '../../../src/domain/notation/notation';
import type { WrittenNote } from '../../../src/domain/notation/written';
import type { MuseScoreDirectionBar } from '../../../src/infrastructure/parsers/pdf/museScoreDirections';
import { readMuseScorePedals } from '../../../src/infrastructure/parsers/pdf/museScorePedals';

const lowerNote: WrittenNote = {
  bar: 0, beat: 2, beats: 2, staff: 2, voice: '1', hand: 'left', clef: 'bass',
  pitch: { letter: 0, octave: 3, alteration: 0 }, sounding: 48, duration: { value: 'half', dots: 0 },
  chord: false, accidental: null, stem: null, beams: [], articulations: [], fermata: null, slurs: [],
  dynamics: null, ornaments: [], trillLine: false, tremolo: null, arpeggio: null, tieStart: false,
  tieStop: false, tuplet: null, tupletStart: null, tupletStop: false,
};

test.each(['note', 'rest'] as const)('anchors a release star at the end of an aligned lower-staff %s', kind => {
  const notes = kind === 'note' ? [lowerNote] : [];
  const notation: Notation = {
    title: '', bars: [{ start: 0, length: 4, navigation: {} }], notes,
    graces: [], rests: [], clefs: [], keySignatures: [], timeSignatures: [], tempos: [], tempoMarks: [],
    pedalMoves: [], pedalMarks: [], octaveShifts: [], dynamics: [], hairpins: [], dynamicLevels: [], words: [],
  };
  const bar: MuseScoreDirectionBar = {
    index: 0,
    measure: { left: 0, right: 100, staves: [{ bottom: 90, space: 5 }, { bottom: 50, space: 5 }] },
    geometry: {
      glyphs: [
        { x: 20, y: 35, text: '\ue650', font: 'Leland', code: 1, size: 20 },
        { x: 58.15, y: 35, text: '\ue655', font: 'Leland', code: 2, size: 20 },
      ],
      segments: [], fills: [], curvedFills: [],
    },
    notes: notes.map(note => ({ x: 55, y: 50, note })),
    columns: [
      { x: 20, beat: 0 },
      { x: 55, beat: 2, rest: kind === 'rest' ? { staff: 2, beats: 2 } : undefined },
      { x: 80, beat: 3 },
    ],
  };
  expect(readMuseScorePedals(notation, [[bar]])).toEqual({
    pedalMarks: [
      { beat: 0, pedal: 'sustain', type: 'start', sign: true, line: false },
      { beat: 4, pedal: 'sustain', type: 'stop', sign: true, line: false },
    ],
    pedalMoves: [
      { bar: 0, beat: 0, pedal: 'sustain', down: true },
      { bar: 0, beat: 4, pedal: 'sustain', down: false },
    ],
  });
});
