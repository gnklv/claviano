// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { applyMuseScoreCurves } from '../../../src/infrastructure/parsers/pdf/museScoreCurves';
import type { PdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import type { MuseScoreDirectionBar } from '../../../src/infrastructure/parsers/pdf/museScoreDirections';
import { attributes, note, parser, score } from '../../support/musicXmlScore';

function arc(from: number, to: number, y: number) {
  const a = { x: from, y }, b = { x: to, y };
  const c = { x: from + (to - from) / 3, y: y + 1 };
  const d = { x: to - (to - from) / 3, y: y + 1 };
  return [{ from: a, control1: c, control2: d, to: b },
    { from: b, control1: { ...d, y: d.y + 0.15 }, control2: { ...c, y: c.y + 0.15 }, to: a }];
}

test('reads both pieces of an offset tie at a system break and rejects an unmatched opening arc', () => {
  const notation = parser.parse(score(`<measure number="1">${attributes(1)}${note('D', 5, 4)}</measure>
    <measure number="2">${note('D', 5, 4)}</measure>`), 'Ties').notation;
  const geometry: PdfGeometry = { curvedFills: [arc(12.3, 20, 1.7), arc(1.5, 3.7, -18.3)],
    fills: [], segments: [], glyphs: [] };
  const bars: MuseScoreDirectionBar[] = notation.notes.map((note, i) => ({
    geometry, index: i,
    measure: { left: 0, right: 20, staves: [{ bottom: -20 * i, space: 1 }, { bottom: -20 * i - 8, space: 1 }] },
    notes: [{ note, x: i ? 3 : 10, y: 1 - i * 20 }],
  }));
  const read = () => applyMuseScoreCurves(bars, notation).notes.map(n => [n.tieStart, n.tieStop, n.slurs]);
  expect(read()).toEqual([[true, false, []], [false, true, []]]);
  geometry.curvedFills.pop();
  expect(read()).toEqual([[false, false, []], [false, false, []]]);
});

test('preserves two attacks when a phrasing slur connects repeated notes', () => {
  const notation = parser.parse(score(`<measure number="1">${attributes(1)}${note('D', 5, 2)}${note('D', 5, 2)}</measure>`), 'Slur').notation;
  const geometry: PdfGeometry = { curvedFills: [arc(2.65, 8.65, 0.9)], fills: [], segments: [], glyphs: [] };
  const bars = [{
    geometry, index: 0,
    measure: { left: 0, right: 10, staves: [{ bottom: 0, space: 1 }, { bottom: -8, space: 1 }] },
    notes: notation.notes.map((note, i) => ({ note, x: 2 + i * 6, y: 0 })),
  }] satisfies MuseScoreDirectionBar[];
  const notes = applyMuseScoreCurves(bars, notation).notes;
  expect(notes.map(n => [n.tieStart, n.tieStop, n.slurs.map(mark => mark.type)])).toEqual([
    [false, false, ['start']], [false, false, ['stop']],
  ]);
});

test('joins slurs across pages when each fragment spans more than one measure', () => {
  const xml = Array.from({ length: 4 }, (_, i) =>
    `<measure number="${i + 1}">${i === 0 ? attributes(1) : ''}${note('D', 5, 4)}</measure>`).join('');
  const notation = parser.parse(score(xml), 'Phrase').notation;
  const page = (curves: PdfGeometry['curvedFills']): PdfGeometry =>
    ({ curvedFills: curves, fills: [], segments: [], glyphs: [] });
  const pages = [page([arc(5.65, 39.6, 1.1)]), page([arc(2, 25.65, 1.1)])];
  const bars: MuseScoreDirectionBar[] = notation.notes.map((note, i) => ({
    geometry: pages[Math.floor(i / 2)], index: i,
    measure: { left: i % 2 * 20, right: i % 2 * 20 + 20,
      staves: [{ bottom: 0, space: 1 }, { bottom: -8, space: 1 }] },
    notes: [{ note, x: 5 + i % 2 * 20, y: 0 }],
  }));
  const read = () => applyMuseScoreCurves(bars, notation).notes.map(n => n.slurs.map(m => m.type));
  expect(read()).toEqual([['start'], [], [], ['stop']]);
  pages[1].curvedFills.pop();
  expect(read()).toEqual([[], [], [], []]);
});

test('keeps distinct numbers for two phrases ending on the same note', () => {
  const xml = `<measure number="1">${attributes(1)}${note('D', 5, 1)}${note('E', 5, 1)}${note('D', 5, 2)}</measure>`;
  const notation = parser.parse(score(xml), 'Nested phrases').notation;
  const geometry: PdfGeometry = { curvedFills: [arc(2.65, 14.65, 1.1), arc(8.65, 14.65, 0.9)],
    fills: [], segments: [], glyphs: [] };
  const bars = [{
    geometry, index: 0, measure: { left: 0, right: 20, staves: [{ bottom: 0, space: 1 }, { bottom: -8, space: 1 }] },
    notes: notation.notes.map((note, i) => ({ note, x: 2 + 6 * i, y: 0 })),
  }] satisfies MuseScoreDirectionBar[];
  expect(applyMuseScoreCurves(bars, notation).notes.map(n => n.slurs.map(m => m.number)))
    .toEqual([[1], [2], [1, 2]]);
});

test('pairs competing slur fragments independently of their PDF painting order', () => {
  const pair = note('D', 5, 2) + note('E', 5, 2);
  const xml = `<measure number="1">${attributes(1)}${pair}</measure><measure number="2">${pair}</measure>`;
  const notation = parser.parse(score(xml), 'Parallel phrases').notation;
  const curves = [
    [arc(4.65, 20, 0), arc(10.65, 20, 2)],
    [arc(2, 5.65, -18.9), arc(2, 12.65, -22)],
  ];
  const positions = [[4, -0.9], [10, 1.1], [5, -19.8], [12, -22.9]];
  const bars: MuseScoreDirectionBar[] = curves.map((curvedFills, index) => ({
    geometry: { curvedFills, fills: [], segments: [], glyphs: [] }, index,
    measure: { left: 0, right: 20, staves: [{ bottom: -20 * index, space: 1 }, { bottom: -20 * index - 8, space: 1 }] },
    notes: notation.notes.flatMap((note, i) => note.bar === index ? [{ note, x: positions[i][0], y: positions[i][1] }] : []),
  }));
  const numbers = () => applyMuseScoreCurves(bars, notation).notes.map(n => n.slurs.map(m => m.number));
  expect(numbers()).toEqual([[1], [2], [2], [1]]);
  for (const page of curves) page.reverse();
  expect(numbers()).toEqual([[1], [2], [2], [1]]);
});

test('anchors a displaced phrase over a held chord using an intervening bass attack', () => {
  const xml = `<measure number="1">${attributes(1)}${note('D', 5, 2)}${note('F', 5, 1)}${note('A', 5, 1)}</measure>`;
  const notation = parser.parse(score(xml), 'Displaced phrase').notation;
  const geometry: PdfGeometry = { curvedFills: [arc(12, 22.65, 1.25)], fills: [], segments: [], glyphs: [] };
  const bass = { ...notation.notes[0], staff: 2, voice: '5', beat: 1, beats: 1 };
  const placed = notation.notes.map((note, i) => ({ note, x: [2, 16, 22][i], y: 0 }));
  const bar = { geometry, index: 0, measure: { left: 0, right: 28,
    staves: [{ bottom: 0, space: 1 }, { bottom: -8, space: 1 }] }, notes: placed } satisfies MuseScoreDirectionBar;
  const read = (withBass: boolean) => {
    const notes = withBass ? [...placed, { note: bass, x: 10, y: -8 }] : placed;
    return applyMuseScoreCurves([{ ...bar, notes }], { ...notation, notes: notes.map(h => h.note) })
      .notes.slice(0, 3).map(n => n.slurs.map(m => m.type));
  };
  expect(read(true)).toEqual([['start'], [], ['stop']]);
  expect(read(false)).toEqual([[], [], []]);

  // With only a repeated note after the hold, the recovered phrase must
  // preserve the second attack even when its two ends are level.
  const repeat = { ...notation.notes[0], beat: 2 };
  const unison = [placed[0], { note: repeat, x: 22, y: 0 }, { note: bass, x: 10, y: -8 }];
  const recovered = applyMuseScoreCurves([{ ...bar, notes: unison }],
    { ...notation, notes: unison.map(h => h.note) }).notes;
  expect(recovered.slice(0, 2).map(n => [n.tieStart, n.tieStop, n.slurs.map(m => m.type)]))
    .toEqual([[false, false, ['start']], [false, false, ['stop']]]);
});
