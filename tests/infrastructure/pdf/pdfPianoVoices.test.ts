import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { FLAT, HALF, center, codePoint, pianoStaffPairs, strips } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { readPickupPreview } from '../../../src/infrastructure/parsers/pdf/pianoPickup';
import { readPolyphonicStaff } from '../../../src/infrastructure/parsers/pdf/pianoVoices';

function voicesFixture() {
  const pdf = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const geometry = extractPdfGeometry(pdf.page(0));
  const measure = pianoStaffPairs(geometry.segments)[6];
  const [upper, lower] = measure.staves;
  const glyphs = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
    && g.y > (upper.bottom + lower.bottom + 4 * upper.space) / 2 && g.y < upper.bottom + 10 * upper.space
    && codePoint(g) >= 0xe000 && codePoint(g) <= 0xf8ff);
  const beams = strips(geometry.fills, upper.space);
  const read = (symbols = glyphs) => readPolyphonicStaff(symbols, upper, geometry.segments, beams, [],
    { start: 21, length: 4, navigation: {} }, 6, 1, 'treble', 0);
  return { read, glyphs, upper };
}

test('reads both voices and aligns the offset half note with its column', () => {
  const { read } = voicesFixture();
  const result = read();
  expect(result?.notes.map(({ note }) => [note.voice, note.beat, note.sounding, note.chord])).toEqual([
    ['1', 21, 76, false], ['1', 21, 79, true], ['1', 21, 84, true],
    ['1', 23, 74, false], ['1', 23, 77, true], ['1', 23, 83, true],
    ['2', 21, 67, false], ['2', 23, 72, false],
  ]);
  expect(result?.notes.at(-1)?.columnX).toBe(result?.notes[3]?.x);
  expect(result!.notes.at(-1)!.x).toBeGreaterThan(result!.notes[3].x);
  expect(result?.rests[0]?.rest).toMatchObject({ voice: '2', beat: 22, displayPitch: null });
});

test('rejects an unpositioned rest where the lower voice needs a displaced rest', () => {
  const { read, glyphs, upper } = voicesFixture();
  expect(read(glyphs.map(g => codePoint(g) === 0xe4e5 ? { ...g, y: center(upper) } : g))).toBeNull();
});

test('rejects an accidental that could carry across voices on the same staff', () => {
  const { read, glyphs, upper } = voicesFixture();
  const head = glyphs.find(g => codePoint(g) === HALF)!;
  expect(read([...glyphs, { ...head, x: head.x - upper.space, text: String.fromCodePoint(FLAT) }])).toBeNull();
});

test('preserves printed fingering placement and rejects a second cue flag without a stem', () => {
  const pdf = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const first = extractPdfGeometry(pdf.page(0));
  const second = extractPdfGeometry(pdf.page(1));
  const firstPageBars = pianoStaffPairs(first.segments).length;
  const measure = pianoStaffPairs(second.segments)[25 - firstPageBars];
  const flag = second.glyphs.find(g => g.x > measure.left && g.x < measure.right && codePoint(g) === 0xe241
    && Math.abs(g.y - measure.staves[0].bottom) < measure.staves[0].space * 3)!;
  expect(flag).toBeDefined();
  const read = (glyphs = second.glyphs) => readPickupPreview(first, 'Cue voice', [{ ...second, glyphs }])?.notation;
  const fingers = read()?.notes.filter(n => n.bar === 26).map(n => [n.staff, n.fingering?.text, n.fingering?.below]);
  expect(fingers).toEqual([
    [1, '1', false], [1, '3', false], [1, '2', false], [1, '5', false], [1, '2-1', false],
    [2, '5', false], [2, '2', false], [2, '3', false],
  ]);
  expect(read([...second.glyphs, { ...flag, x: flag.x + measure.staves[0].space * 2 }])?.bars).toHaveLength(25);
});

test('rejects an apparently silent opening with an orphaned bass stem', () => {
  const pdf = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const first = extractPdfGeometry(pdf.page(0));
  const second = extractPdfGeometry(pdf.page(1));
  const measure = pianoStaffPairs(second.segments)[23 - pianoStaffPairs(first.segments).length];
  const [upper, lower] = measure.staves;
  const [melody] = second.glyphs.filter(g => g.x > measure.left && g.x < measure.right && codePoint(g) === HALF
    && g.y > upper.bottom && g.y < upper.bottom + 4 * upper.space).sort((a, b) => a.x - b.x);
  const bassStem = { x1: melody.x, x2: melody.x, y1: lower.bottom + 2 * lower.space,
    y2: lower.bottom - lower.space, width: lower.space * 0.1 };
  const result = readPickupPreview(first, 'Missing head', [{ ...second, segments: [...second.segments, bassStem] }]);
  expect(result?.notation.bars).toHaveLength(23);
});
