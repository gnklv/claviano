// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import { roundDotCenter } from '../src/infrastructure/parsers/pdf/curves';
import {
  isArticulationGlyph, isFermataGlyph, readBarArticulations, readBarFermatas,
} from '../src/infrastructure/parsers/pdf/pianoArticulations';
import { isHead, pianoStaffPairs, sortedX, top } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { dotAtHead } from '../src/infrastructure/parsers/pdf/pianoNotes';
import { bytes, parser } from './musicXmlScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
const measures = pianoStaffPairs(geometry.segments);
const reference = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'Showcase').notation;
const measure = measures[14];
const [upper, lower] = measure.staves;
const space = upper.space;
const middle = (upper.bottom + top(lower)) / 2;
const glyphs = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
  && g.y > lower.bottom - space * 5 && g.y < top(upper) + space * 6);
const expected = reference.notes.filter(note => note.bar === 14);
const positioned = [1, 2].flatMap(staff => {
  const heads = sortedX(glyphs.filter(g => isHead(g) && (g.y > middle) === (staff === 1)));
  return expected.filter(note => note.staff === staff).map((note, i) => ({
    x: heads[i].x, y: heads[i].y, note: { ...note, articulations: [] },
  }));
});

test('reads the engraved articulations on both staves, including detached legato and stacked accents', () => {
  const symbols = glyphs.filter(isArticulationGlyph);
  expect(symbols).toHaveLength(10);
  expect(readBarArticulations(symbols, [], positioned, space)?.map(entry => entry.note)).toEqual(expected);
  expect(readBarArticulations([...symbols, symbols[0]], [], positioned, space)).toBeNull();
  expect(readBarArticulations(symbols, [], positioned.slice(1), space)).toBeNull();
});

test('attaches a drawn staccato dot without changing the duration or consuming an augmentation dot', () => {
  const p = positioned[0];
  const head = glyphs.find(g => g.x === p.x && g.y === p.y)!;
  const durationDot = { x: p.x + space * 1.68, y: p.y + space * 0.5 };
  const contour = geometry.curvedFills.find(candidate => roundDotCenter(candidate, space) !== null)!;
  const center = roundDotCenter(contour, space)!;
  const move = (point: typeof center) => ({
    x: point.x - center.x + p.x + space * 0.63,
    y: point.y - center.y + p.y + space * 0.8,
  });
  const dot = roundDotCenter(contour.map(edge => ({
    from: move(edge.from), to: move(edge.to), control1: move(edge.control1), control2: move(edge.control2),
  })), space)!;
  expect(dotAtHead(dot, head, space)).toBe(false);
  expect(dotAtHead(durationDot, head, space)).toBe(true);
  expect(readBarArticulations([], [dot], [p], space)?.[0]?.note).toEqual({
    ...p.note, articulations: ['staccato'],
  });
  expect(readBarArticulations([], [durationDot], [p], space)).toBeNull();
});

test('attaches the printed fermata to the final treble note in bar 15', () => {
  const measure = measures[15];
  const glyphs = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
    && g.y > measure.staves[0].bottom && g.y < top(measure.staves[0]) + space * 6);
  const heads = sortedX(glyphs.filter(isHead));
  const expected = reference.notes.filter(note => note.bar === 15 && note.staff === 1);
  const positioned = expected.map((note, i) => ({
    x: heads[i].x, y: heads[i].y, note: { ...note, fermata: null },
  }));
  const marks = glyphs.filter(isFermataGlyph);
  expect(marks).toHaveLength(1);
  expect(readBarFermatas(marks, positioned, space)?.map(entry => entry.note)).toEqual(expected);
  expect(readBarFermatas([...marks, marks[0]], positioned, space)).toBeNull();
  expect(readBarFermatas(marks, positioned.slice(0, -1), space)).toBeNull();
});

test('applies the engraved stack of staccato marks to both members of each chord in bar 18', () => {
  const measure = measures[18];
  const glyphs = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
    && g.y > measure.staves[0].bottom && g.y < top(measure.staves[0]) + space * 6);
  const heads = sortedX(glyphs.filter(isHead));
  const expected = reference.notes.filter(note => note.bar === 18 && note.staff === 1);
  const positioned = expected.map((note, i) => ({
    x: heads[i].x, y: heads[i].y, note: { ...note, articulations: [] },
  }));
  const marks = glyphs.filter(isArticulationGlyph);
  expect(marks).toHaveLength(6);
  expect(readBarArticulations(marks, [], positioned, space)?.map(entry => entry.note)).toEqual(expected);
  expect(readBarArticulations([...marks, marks[0]], [], positioned, space)).toBeNull();
});
