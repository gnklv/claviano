// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import { isHead, pianoStaffPairs, top, within } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { isGraceGlyph, readBarGraces } from '../src/infrastructure/parsers/pdf/pianoGraces';
import { bytes, parser } from './musicXmlScore';

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
