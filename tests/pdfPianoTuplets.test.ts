import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import { center, musicGlyphs, pianoStaffPairs, strips } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { readEvents } from '../src/infrastructure/parsers/pdf/pianoNotes';
import { isTupletGlyph, readTuplets } from '../src/infrastructure/parsers/pdf/pianoTuplets';

function example(staffIndex: 0 | 1) {
  const pdf = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const geometry = extractPdfGeometry(pdf.page(0));
  const measure = pianoStaffPairs(geometry.segments)[5];
  const staff = measure.staves[staffIndex];
  const digits = geometry.glyphs.filter(g => isTupletGlyph(g) && g.x > measure.left && g.x < measure.right
    && Math.abs(g.y - center(staff)) < 6 * staff.space);
  const events = readEvents(musicGlyphs(geometry.glyphs, measure, staff), staff, geometry.segments,
    strips(geometry.fills, staff.space))!;
  return { events, digits, segments: geometry.segments, space: staff.space };
}

test('reads visible and metrically corroborated hidden beamed groups from the vector PDF', () => {
  const { events, digits, segments, space } = example(0);
  const notes = readTuplets(events, digits, segments, space, 4)!;
  expect(notes.filter(e => e.tupletStart).map(e => [e.tuplet, e.tupletStart])).toEqual([
    [{ actual: 3, normal: 2 }, { showNumber: true, bracket: false }],
    [{ actual: 3, normal: 2 }, { showNumber: false, bracket: false }],
    [{ actual: 5, normal: 4 }, { showNumber: true, bracket: false }],
  ]);
  expect(notes.filter(e => e.tupletStop)).toHaveLength(3);
  expect(notes.reduce((sum, n) => sum + n.beats, 0)).toBeCloseTo(4);
  expect(readTuplets(events, digits.filter(g => g.text !== '\ue883'), segments, space, 4)).toBeNull();
});

test('requires the hooked bracket to associate a printed number with quarter notes', () => {
  const { events, digits, segments, space } = example(1);
  const notes = readTuplets(events, digits, segments, space, 4)!;
  expect(notes[0]?.tupletStart).toEqual({ showNumber: true, bracket: true });
  expect(notes.map(e => e.beats)).toEqual([2 / 3, 2 / 3, 2 / 3, 2]);
  expect(readTuplets(events, digits, [], space, 4)).toBeNull();
});
