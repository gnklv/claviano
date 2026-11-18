// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import { codePoint, isHead, pianoStaffPairs, sortedX, top } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { readBarOrnaments } from '../src/infrastructure/parsers/pdf/pianoOrnaments';
import { bytes, parser } from './musicXmlScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(1));
const measure = pianoStaffPairs(geometry.segments)[2];
const [upper, lower] = measure.staves;
const middle = (upper.bottom + top(lower)) / 2;
const printed = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
  && g.y < top(upper) + 6 * upper.space && g.y > lower.bottom - 5 * lower.space);
const source = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'showcase').notation;
const notes = source.notes.filter(n => n.bar === 21);
const positioned = measure.staves.flatMap((_, i) => {
  const heads = sortedX(printed.filter(g => isHead(g) && (g.y > middle) === (i === 0)));
  return notes.filter(n => n.staff === i + 1).map((note, j) => ({
    ...heads[j], note: { ...note, ornaments: [], trillLine: false },
  }));
});

test('reads trill, mordents, turn and delayed turn from their printed positions', () => {
  expect(readBarOrnaments(printed, positioned, measure)?.map(n => n.note)).toEqual(notes);
});

test('requires a continuous trill extension with an end cap', () => {
  for (const piece of printed.filter(g => [0xe59d, 0xe59e].includes(codePoint(g)))) {
    expect(readBarOrnaments(printed.filter(g => g !== piece), positioned, measure)).toBeNull();
  }
});

test('rejects a small accidental detached from its turn', () => {
  const detached = printed.map(g => codePoint(g) === 0xe261 ? { ...g, x: g.x + upper.space } : g);
  expect(readBarOrnaments(detached, positioned, measure)).toBeNull();
});
