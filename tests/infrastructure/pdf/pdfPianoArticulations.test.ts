// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { roundDotCenter } from '../../../src/infrastructure/parsers/pdf/curves';
import { readPianoNoteMarks } from '../../../src/infrastructure/parsers/pdf/pianoNoteMarks';
import {
  isArticulationGlyph, isFermataGlyph, readBarArticulations, readBarFermatas,
} from '../../../src/infrastructure/parsers/pdf/pianoArticulations';
import { isHead, pianoStaffPairs, sortedX, top } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { dotAtHead } from '../../../src/infrastructure/parsers/pdf/pianoNotes';
import { bytes, parser } from '../../support/musicXmlScore';

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

test.each([1, -1])('reads MuseScore articulation stacks from the chord outward on side %i', side => {
  const p = positioned[0];
  const marks = [
    { code: 0xe4a6, distance: 1.5 },
    { code: 0xe4a2, distance: 0.8 },
  ].map(({ code: above, distance }) => {
    const code = above + Number(side < 0);
    return { code, text: String.fromCodePoint(code), font: 'Leland', size: space * 4,
      x: p.x + space * 0.4, y: p.y + side * space * distance };
  });
  const [entry] = readPianoNoteMarks(marks, [p], space);
  expect(entry.note.articulations).toEqual(['staccato', 'staccatissimo']);
});

test('attaches staccato dots above the stems of closely spaced beamed notes', () => {
  const first = positioned[0];
  const heads = [0, 1, 2].map(i => ({
    x: first.x + i * 1.807 * space,
    y: first.y - (i === 2 ? space : 0),
    note: {
      ...first.note, beat: first.note.beat + i * 0.25,
      stem: 'up' as const, beams: ['continue', 'continue'] as const,
    },
  }));
  const marks = [1, 0].map(i => ({
    code: 0xe4a2, text: String.fromCodePoint(0xe4a2), font: 'Leland', size: space * 4,
    x: heads[i].x + space * 1.089, y: heads[i].y + space * 4.094,
  }));
  const output = readPianoNoteMarks(marks, heads, space);
  expect(output.map(entry => entry.note.articulations)).toEqual([['staccato'], ['staccato'], []]);
});

test.each([1, -1])('reads the MuseScore tenuto-staccato glyph on side %i as one portato', side => {
  const lower = positioned[0];
  const upper = { ...lower, y: lower.y + 3.5 * space, note: { ...lower.note, chord: true } };
  const code = 0xe4b2 + Number(side < 0);
  const mark = { code, text: String.fromCodePoint(code), font: 'Leland', size: space * 4,
    x: lower.x + space * 0.017, y: (side > 0 ? upper.y : lower.y) + side * space * 0.93 };
  const oppositeStaff = { ...lower, y: lower.y - 9.8 * space, note: { ...lower.note, staff: 2 } };
  const result = readPianoNoteMarks([mark], [lower, upper, oppositeStaff], space);
  expect(result.map(entry => entry.note.articulations)).toEqual([['portato'], [], []]);
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

test('assigns an inter-staff finger number only to the closer chord', () => {
  const upper = positioned[0];
  const bass = { ...upper, y: upper.y - 7 * space, note: { ...upper.note, staff: 2, voice: '5' } };
  const mark = { text: '3', code: 51, font: 'Edwin-Roman', size: 1.6 * space,
    x: upper.x + 0.2 * space, y: bass.y + 2 * space };
  const read = (y: number) => readPianoNoteMarks([{ ...mark, y }], [upper, bass], space).map(n => n.note.fingering);
  expect(read(mark.y)).toEqual([undefined, { text: '3', below: false }]);
  expect(read((upper.y + bass.y) / 2)).toEqual([undefined, undefined]);
  const upperMark = { ...mark, text: '2', y: upper.y - 2 * space };
  const both = readPianoNoteMarks([mark, upperMark], [upper, bass], space);
  expect(both.map(n => n.note.fingering)).toEqual([{ text: '2', below: true }, { text: '3', below: false }]);
});

test('assigns the Leland inverted mordent beneath a beamed note in the upper staff', () => {
  const first = positioned[0];
  const bass = { ...first, y: first.y - 13 * space, note: { ...first.note, staff: 2, voice: '5' } };
  const sign = { text: '\ue56c', code: 0xe56c, font: 'Leland', size: 4 * space,
    x: first.x - .3 * space, y: first.y - 5.5 * space };
  const read = (y: number) => readPianoNoteMarks([{ ...sign, y }], [first, bass], space).map(n => n.note.ornaments);
  expect(read(sign.y)).toEqual([[{ kind: 'inverted-mordent', below: true, accidentalAbove: null, accidentalBelow: null }], []]);
  expect(read(first.y - 6.5 * space)).toEqual([[], []]);
});
