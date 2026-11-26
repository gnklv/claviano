// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { isHead, pianoStaffPairs, top, within } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { isGraceGlyph, museScoreGraceGlyphs, readBarGraces } from '../../../src/infrastructure/parsers/pdf/pianoGraces';
import { bytes, parser } from '../../support/musicXmlScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(1));
const measure = pianoStaffPairs(geometry.segments)[1];
const [upper, lower] = measure.staves;
const middle = (upper.bottom + top(lower)) / 2;
const printed = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
  && g.y < top(upper) + 6 * upper.space && g.y > lower.bottom - 5 * lower.space);
const graceGlyphs = printed.filter(g => isGraceGlyph(g, upper.space));
const source = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'showcase').notation;
const offset = source.notes.findIndex(n => n.bar === 20);
const notes = source.notes.filter(n => n.bar === 20);
const positioned = measure.staves.flatMap((_, i) => {
  const heads = printed.filter(g => isHead(g) && within(g.size, 4 * upper.space, 0.1 * upper.space)
    && (g.y > middle) === (i === 0)).sort((a, b) => a.x - b.x);
  return notes.filter(note => note.staff === i + 1).map((note, j) => ({ ...heads[j], note: { ...note, slurs: [] } }));
});

test('reads the slashed, slurred, and double-beamed grace groups on both staves', () => {
  const result = readBarGraces(geometry, measure, graceGlyphs, positioned, 2, offset);
  expect(result?.graces).toEqual(source.graces.filter(g => g.bar === 20));
  expect(result?.notes.map(n => n.note)).toEqual(notes);
  expect(result?.curves.size).toBe(1);
});

test('requires a flag or beam at each grace stem', () => {
  const flagsRemoved = graceGlyphs.filter(g => g.text.codePointAt(0) !== 0xe240);
  expect(readBarGraces(geometry, measure, flagsRemoved, positioned, 2, offset)).toBeNull();
});

test('attaches a MuseScore grace pair to the matching voice at a shared attack column', () => {
  const staff = { left: 0, right: 240, bottom: 100, space: 10 };
  const bar = { left: 0, right: 240, staves: [staff, { ...staff, bottom: 0 }] } as const;
  const head = (x: number, y: number) => ({ x, y, text: '\uE0A4', code: 6, size: 28, font: 'Leland', textObject: 0 });
  const first = head(115, 140), second = head(126, 145);
  const smallChordMember = head(64, 135);
  const beam = (y: number) => [{ x: 123.3, y }, { x: 135.1, y: y + 2.7 },
    { x: 135.1, y: y - 0.9 }, { x: 123.3, y: y - 3.6 }];
  const from = { x: 119.55, y: 131 }, to = { x: 144.5, y: 131 };
  const arc = [
    { from, to, control1: { x: 125.5, y: 125.6 }, control2: { x: 138.5, y: 125.6 } },
    { from: to, to: from, control1: { x: 138.5, y: 122.8 }, control2: { x: 125.5, y: 122.8 } },
  ];
  const engraving = {
    ...geometry,
    segments: [
      { x1: 65, y1: 120, x2: 65, y2: 90, width: 1 },
      { x1: 123.71, y1: 140.9, x2: 123.71, y2: 170, width: 1 },
      { x1: 134.71, y1: 145.9, x2: 134.71, y2: 172.5, width: 1 },
    ],
    fills: [beam(171.6), beam(166.35)],
    curvedFills: [arc],
  };
  const graceGlyphs = museScoreGraceGlyphs(engraving, [first, second, smallChordMember], staff.space);
  expect(graceGlyphs).toEqual([first, second]);
  const common = { ...notes[0], bar: 4, beat: 17, staff: 1, clef: 'treble', chord: false, slurs: [] } as const;
  const down = { x: 138, y: 120, note: { ...common, stem: 'down' } as const };
  const up = { x: 138, y: 140, note: { ...common, stem: 'up' } as const };
  const result = readBarGraces(engraving, bar, [], [down, up], -1, 69, [graceGlyphs, []]);
  expect(result?.graces.map(group => [group.bar, group.beat, group.leadsTo,
    group.notes.map(note => [note.sounding, note.value, note.slur, note.slash])])).toEqual([
    [4, 17, 70, [[77, 'sixteenth', true, false], [79, 'sixteenth', false, false]]],
  ]);
  expect(result?.slurTargets).toEqual([up]);
  expect(result?.curves.has(arc)).toBe(true);
});

test('reads a slashed grace chord from its shared stem and leaves a reduced regular chord member in place', () => {
  const staff = { left: 0, right: 240, bottom: 100, space: 10 };
  const bar = { left: 0, right: 240, staves: [staff, { ...staff, bottom: 0 }] } as const;
  const glyph = (x: number, y: number, text: string) =>
    ({ x, y, text, code: 6, size: 28, font: 'Leland', textObject: 0 });
  const lower = glyph(100, 125, '\uE0A4'), upper = glyph(100, 135, '\uE0A4');
  const flag = glyph(108.3, 159.5, '\uE240'), sharp = glyph(91.6, 135, '\uE262');
  const regular = glyph(160, 135, '\uE0A4'), regularSharp = glyph(151.6, 135, '\uE262');
  const engraving = {
    ...geometry, fills: [], curvedFills: [],
    segments: [
      { x1: 108.7, y1: 125.9, x2: 108.7, y2: 159.5, width: 0.77 },
      { x1: 103.8, y1: 143.5, x2: 116.5, y2: 151.5, width: 1.1 },
      { x1: 160.55, y1: 133.7, x2: 160.55, y2: 100, width: 1.1 },
    ],
  };
  const row = museScoreGraceGlyphs(engraving, [upper, lower, sharp, flag, regular, regularSharp], staff.space);
  expect(row).toEqual([upper, lower, sharp, flag]);
  const principal = { x: 121, y: 130, note: { ...notes[0], clef: 'treble', staff: 1, chord: false } as const };
  const result = readBarGraces(engraving, bar, [], [principal], 2, 0, [row, []]);
  expect(result?.graces[0]?.notes.map(n => [n.sounding, n.chord, n.slash, n.value])).toEqual([
    [73, false, true, 'eighth'], [77, true, true, 'eighth'],
  ]);
});

test('carries a grace accidental across repeated pitches under an octave clef', () => {
  const staff = { left: 0, right: 240, bottom: 100, space: 10 };
  const bar = { left: 0, right: 240, staves: [staff, { ...staff, bottom: 0 }] } as const;
  const glyph = (x: number, y: number, text: string) =>
    ({ x, y, text, code: 6, size: 28, font: 'Leland', textObject: 0 });
  const row = [glyph(91, 125, '\uE262'), ...[100, 117].flatMap(x =>
    [glyph(x, 125, '\uE0A4'), glyph(x + 8.7, 159.5, '\uE240')])];
  const engraving = { ...geometry, fills: [], curvedFills: [], segments: [100, 117].map(x =>
    ({ x1: x + 8.7, y1: 125.9, x2: x + 8.7, y2: 159.5, width: 0.77 })) };
  const principal = { x: 140, y: 130, note: { ...notes[0], sounding: notes[0].sounding + 12, clef: 'treble', staff: 1, chord: false } as const };
  const result = readBarGraces(engraving, bar, [], [principal], 0, 0, [row, []]);
  expect(result?.graces[0]?.notes.map(n => [n.accidental, n.pitch.alteration, n.sounding])).toEqual([['sharp', 1, 85], [null, 1, 85]]);
});
