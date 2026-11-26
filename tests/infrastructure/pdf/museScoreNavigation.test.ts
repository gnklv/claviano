import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { performanceOrder, type BarNavigation } from '../../../src/domain/notation/navigation';
import type { Notation, WrittenBar } from '../../../src/domain/notation/notation';
import type { WrittenNote } from '../../../src/domain/notation/written';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry, type PdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { applyMuseScoreDirections, type MuseScoreDirectionBar } from '../../../src/infrastructure/parsers/pdf/museScoreDirections';
import { museScoreMeasures } from '../../../src/infrastructure/parsers/pdf/museScoreMeasures';
import { applyMuseScoreNavigation } from '../../../src/infrastructure/parsers/pdf/museScoreNavigation';
import type { TimedNote } from '../../../src/infrastructure/parsers/pdf/pianoNotes';

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

test('assigns a centred segno to the following repeat and a coda sign to the first bar of its system', () => {
  const space = 5;
  const glyph = (x: number, y: number, text: string) => ({ x, y, text, code: text.codePointAt(0)!, font: 'Leland', size: 20 });
  const geometry: PdfGeometry = { fills: [], curvedFills: [], segments: [],
    glyphs: [glyph(56, 130, '\ue047'), glyph(23, 62, '\ue048')] };
  const positions = [[30, 60, 100], [60, 100, 100], [30, 100, 30]].map(([left, right, bottom], index) => ({
    index, geometry, notes: [], measure: { left, right,
      staves: [{ bottom, space }, { bottom: bottom - 35, space }] as const },
  }));
  const bars = positions.map(({ index }) => ({ start: 4 * index, length: 4, navigation: {} }));
  expect(applyMuseScoreDirections(notation(bars), positions).bars.map(b => b.navigation))
    .toEqual([{}, { segno: true, segnoSign: true }, { coda: true, codaSign: true }]);
});

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
  const throughRest = applyMuseScoreNavigation(notation(bars, notes.map(t => t.note)), [
    { geometry, measure: { left: 10, right: 100, staves }, notes, index: 0, columns: [
      { x: 40, beat: 0 }, { x: 55, beat: 1 },
      { x: 63, beat: 2, rest: { staff: 1, beats: 0.5 } },
      { x: 68, beat: 2, rest: { staff: 2, beats: 2 } },
      { x: 85, beat: 3, rest: { staff: 1, beats: 1 } },
    ] },
  ]);
  expect(throughRest.octaveShifts).toEqual([{ staff: 1, start: 0, end: 2.5, octaves: 1 }]);
  const withMarginHook = applyMuseScoreNavigation(notation(bars, notes.map(t => t.note)), [
    { geometry: { ...geometry, segments: [
      { ...geometry.segments[0], x2: 107 },
      { ...geometry.segments[1], x1: 107, x2: 107 },
    ] }, measure: { left: 10, right: 100, staves }, notes, index: 0 },
  ]);
  expect(withMarginHook.octaveShifts).toEqual([{ staff: 1, start: 0, end: 3, octaves: 1 }]);
});

test('joins matching octave lines across systems and preserves a change of direction', () => {
  const staves = [{ bottom: 110, space: 5 }, { bottom: 60, space: 5 }] as const;
  const bars = [0, 4].map(start => ({ start, length: 4, navigation: {} }));
  function read(secondDirection: number) {
    const positions = bars.map(({ start }, index): MuseScoreDirectionBar => {
      const octaves = index === 0 ? -1 : secondDirection;
      const y = octaves > 0 ? 85 : 50;
      const railY = y + 4;
      const right = index === 0 ? 100 : 75;
      const geometry: PdfGeometry = {
        glyphs: [{ x: 40, y, font: 'Leland', size: 20, code: 1, text: octaves > 0 ? '\ue511' : '\ue510' }],
        segments: [{ x1: octaves > 0 ? 59.5 : 48.75, x2: right, y1: railY, y2: railY, width: 0.5 }],
        fills: [], curvedFills: [],
      };
      if (index === 1) geometry.segments.push({ x1: right, x2: right, y1: railY, y2: railY - octaves * 5, width: 0.5 });
      const note: WrittenNote = {
        bar: index, beat: start, beats: 1, staff: 2, voice: '5', hand: 'left', clef: 'bass',
        pitch: { letter: 0, octave: 3, alteration: 0 }, sounding: 48,
        duration: { value: 'quarter', dots: 0 }, chord: false,
        accidental: null, stem: null, beams: [], articulations: [], fermata: null, slurs: [], dynamics: null,
        ornaments: [], trillLine: false, tremolo: null, arpeggio: null, tieStart: false, tieStop: false,
        tuplet: null, tupletStart: null, tupletStop: false,
      };
      return { geometry, measure: { left: 10, right: 100, staves }, notes: [{ x: 40, y: 70, note }], index };
    });
    return applyMuseScoreNavigation(notation(bars, positions.flatMap(p => p.notes.map(n => n.note))), positions);
  }
  expect(read(-1).octaveShifts).toEqual([{ staff: 2, start: 0, end: 5, octaves: -1 }]);
  const changed = read(1);
  expect(changed.octaveShifts).toEqual([
    { staff: 2, start: 0, end: 4, octaves: -1 },
    { staff: 2, start: 4, end: 5, octaves: 1 },
  ]);
  expect(changed.notes.map(note => note.sounding)).toEqual([36, 60]);
});
