import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { readBarAttributes } from '../../../src/infrastructure/parsers/pdf/pianoAttributes';
import { codePoint, pianoStaffPairs, sortedX, top } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
const measures = pianoStaffPairs(geometry.segments);

function printed(index: number) {
  const { left, right, staves: [upper, lower] } = measures[index];
  return sortedX(geometry.glyphs.filter(g => g.x > left && g.x < right
    && g.y > lower.bottom - upper.space * 5 && g.y < top(upper) + upper.space * 6
    && codePoint(g) >= 0xe000 && codePoint(g) <= 0xf8ff));
}

const beforeChange = {
  bars: Array.from({ length: 10 }, (_, i) => ({ start: i ? 1 + (i - 1) * 4 : 0, length: i ? 4 : 1, navigation: {} })),
  clefs: [{ staff: 1, beat: 0, clef: 'treble' }, { staff: 2, beat: 0, clef: 'bass' }] as const,
  keySignatures: [{ beat: 0, fifths: 0, minor: false }],
  timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
  tempoMarks: [],
  tempos: [],
};

test('reads a paired inline key and meter and a printed dotted-quarter tempo', () => {
  const bar = readBarAttributes(geometry, measures[10], printed(10), beforeChange, false, measures[9], measures[11]);
  expect(bar).not.toBeNull();
  expect(bar?.changes.keySignatures.at(-1)).toEqual({ beat: 37, fifths: -3, minor: false });
  expect(bar?.changes.timeSignatures.at(-1)).toEqual({ beat: 37, numerator: 6, denominator: 8 });
  expect(bar?.changes.tempoMarks).toEqual([{ beat: 37, unit: { value: 'quarter', dots: 1 }, perMinute: 60, printed: true }]);
  expect(bar?.changes.tempos).toEqual([{ bar: 10, beat: 37, bpm: 90 }]);
  expect(bar?.glyphs.every(g => [0xe0a3, 0xe0a4].includes(codePoint(g)))).toBe(true);
  expect([...bar!.readText].map(g => g.text).join('').replace(/\s/g, '')).toBe('\ueca5\uecb7=60');
});

test('applies the preceding small clef at the new bar', () => {
  const bar = readBarAttributes(geometry, measures[10], printed(10), beforeChange, false, measures[9], measures[11])!;
  expect(bar.changes.clefs).toEqual(beforeChange.clefs);
  const afterChange = { ...bar.changes, bars: [...beforeChange.bars, { start: 37, length: 3, navigation: {} }] };
  const next = readBarAttributes(geometry, measures[11], printed(11), afterChange, false, measures[10], measures[12]);
  expect(next?.clefs).toEqual(['treble', 'treble']);
  expect(next?.changes.clefs.at(-1)).toEqual({ staff: 2, beat: 40, clef: 'treble' });
  expect(next?.changes.keySignatures).toBe(bar.changes.keySignatures);
  expect(next?.changes.timeSignatures).toBe(bar.changes.timeSignatures);
});

test('rejects a missing meter digit on one staff', () => {
  const glyphs = printed(10);
  const digit = glyphs.find(g => codePoint(g) === 0xe086)!;
  const bar = readBarAttributes(geometry, measures[10], glyphs.filter(g => g !== digit), beforeChange,
    false, measures[9], measures[11]);
  expect(bar).toBeNull();
});

test('validates paired cancellation naturals against the preceding key', () => {
  const glyphs = printed(10).map(g => codePoint(g) === 0xe260 ? { ...g, text: '\ue261' } : g);
  const previous = { ...beforeChange, keySignatures: [{ beat: 0, fifths: -3, minor: false }] };
  const read = (marks: typeof glyphs) => readBarAttributes(geometry, measures[10], marks, previous,
    false, measures[9], measures[11]);
  expect(read(glyphs)?.changes.keySignatures.at(-1)).toEqual({ beat: 37, fifths: 0, minor: false });
  const missing = glyphs.find(g => codePoint(g) === 0xe261);
  expect(read(glyphs.filter(g => g !== missing))).toBeNull();
});
