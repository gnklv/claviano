import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { performanceOrder, type BarNavigation } from '../src/domain/notation/navigation';
import type { Notation, WrittenBar } from '../src/domain/notation/notation';
import type { WrittenNote } from '../src/domain/notation/written';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry, type PdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import type { MuseScoreDirectionBar } from '../src/infrastructure/parsers/pdf/museScoreDirections';
import { museScoreMeasures } from '../src/infrastructure/parsers/pdf/museScoreMeasures';
import { applyMuseScoreNavigation } from '../src/infrastructure/parsers/pdf/museScoreNavigation';
import type { TimedNote } from '../src/infrastructure/parsers/pdf/pianoNotes';

function notation(bars: readonly WrittenBar[], notes: readonly WrittenNote[] = []): Notation {
  return {
    title: '', bars, notes, graces: [], rests: [], clefs: [], keySignatures: [], timeSignatures: [],
    tempos: [], tempoMarks: [], pedalMoves: [], pedalMarks: [], octaveShifts: [], dynamics: [],
    hairpins: [], dynamicLevels: [], words: [],
  };
}

const czardas: Record<number, BarNavigation> = {
  14: { repeatStart: true }, 21: { repeatEnd: { times: 2 } },
  22: { repeatStart: true }, 37: { repeatEnd: { times: 2 } },
  38: { repeatStart: true }, 53: { repeatEnd: { times: 2 } }, 86: { repeatStart: true },
};
const goldenHour: Record<number, BarNavigation> = {
  49: { repeatStart: true },
  54: { ending: [1], endingLabel: '1.' }, 55: { ending: [1] },
  56: { repeatEnd: { times: 2 }, ending: [1], endingClosed: true },
  57: { ending: [2], endingLabel: '2.', endingClosed: false },
};

for (const [name, expected, playedBars] of [
  ['czardas', czardas, 174], ['golden-hour-jvke-updated-ver', goldenHour, 109],
] as const) {
  const path = `samples/${name}.pdf`;
  test.skipIf(!existsSync(path))(`reads the repeat route from ${name} barlines and volta brackets`, () => {
    const doc = readPdf(readFileSync(path));
    const positions: MuseScoreDirectionBar[] = [];
    for (let page = 0; page < doc.pageCount; page++) {
      const geometry = extractPdfGeometry(doc.page(page));
      for (const measure of museScoreMeasures(geometry)) {
        positions.push({ geometry, measure, index: positions.length, notes: [] });
      }
    }
    const bars = positions.map(({ index }) => ({ start: index * 4, length: 4, navigation: {} }));
    const result = applyMuseScoreNavigation(notation(bars), positions);
    const actual = result.bars.map(b => b.navigation);
    const reference = positions.map(({ index }) => expected[index + 1] ?? {});
    expect(actual).toEqual(reference);
    expect(performanceOrder(actual)).toHaveLength(playedBars);
  });
}

test('applies a printed octave line over one staff and preserves its written pitches', () => {
  const geometry: PdfGeometry = {
    glyphs: [{ x: 40, y: 139, font: 'Leland', size: 20, code: 1, text: '\ue510' }],
    segments: [
      { x1: 48.75, y1: 146.8, x2: 75, y2: 146.8, width: 0.5 },
      { x1: 74.75, y1: 147.05, x2: 74.75, y2: 141.55, width: 0.5 },
    ],
    fills: [], curvedFills: [],
  };
  const staves = [{ bottom: 110, space: 5 }, { bottom: 60, space: 5 }] as const;
  const note: WrittenNote = {
    bar: 0, beat: 0, beats: 1, staff: 1, voice: '1', hand: 'right', clef: 'treble',
    pitch: { letter: 0, octave: 4, alteration: 0 }, sounding: 60,
    duration: { value: 'quarter', dots: 0 }, chord: false,
    accidental: null, stem: null, beams: [], articulations: [], fermata: null, slurs: [], dynamics: null,
    ornaments: [], trillLine: false, tremolo: null, arpeggio: null, tieStart: false, tieStop: false,
    tuplet: null, tupletStart: null, tupletStop: false,
  };
  const notes: TimedNote[] = [
    { x: 40, y: 128, note },
    { x: 55, y: 130, note: { ...note, beat: 1 } },
    { x: 40, y: 77, note: { ...note, staff: 2 } },
    { x: 83, y: 130, note: { ...note, beat: 2 } },
  ];
  const bars = [{ start: 0, length: 4, navigation: {} }];
  const result = applyMuseScoreNavigation(notation(bars, notes.map(t => t.note)), [
    { geometry, measure: { left: 10, right: 100, staves }, notes, index: 0 },
  ]);
  expect(result.octaveShifts).toEqual([{ staff: 1, start: 0, end: 2, octaves: 1 }]);
  expect(result.notes.map(n => n.sounding)).toEqual([72, 72, 60, 60]);
  expect(result.notes.map(n => n.pitch)).toEqual(notes.map(t => t.note.pitch));
});
