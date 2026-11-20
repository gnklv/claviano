import { expect, test } from 'vitest';
import { readPianoAttacks } from '../../../src/infrastructure/parsers/pdf/pianoAttacks';
import type { PdfGeometry, PdfGlyph } from '../../../src/infrastructure/parsers/pdf/geometry';

function glyph(x: number, y: number, text: string, font = 'Leland'): PdfGlyph {
  return { x, y, text, code: text.codePointAt(0)!, font, size: 4 };
}

test('times a beamed triplet from its italic number even when the number lies outside the staff row', () => {
  const heads = [0, 3, 6].map(x => glyph(x, 0, '\ue0a4'));
  const geometry: PdfGeometry = { glyphs: [...heads, glyph(3.8, 4.5, '3', 'Edwin-Italic')],
    segments: heads.map(h => ({ x1: h.x + 1.24, x2: h.x + 1.24, y1: 0.16, y2: 3.5, width: 0.1 })),
    fills: [], curvedFills: [] };
  const beams = [{ left: 1.24, right: 7.24, yAt: () => 3.5 }];
  const read = () => readPianoAttacks(geometry, heads, { bottom: 0, space: 1 }, beams, 1);
  expect(read()?.map(a => [a.beats, a.triplet])).toEqual([[1 / 3, 'start'], [1 / 3, 'continue'], [1 / 3, 'stop']]);
  geometry.glyphs.pop();
  expect(read()?.map(a => a.beats)).toEqual([0.5, 0.5, 0.5]);
});

test('uses the flag touching a stem tip across the staff midpoint', () => {
  const head = glyph(0, 0, '\ue0a4');
  const geometry = { glyphs: [head, glyph(1.24, 6, '\ue240')], fills: [], curvedFills: [],
    segments: [{ x1: 1.24, x2: 1.24, y1: 0.16, y2: 6, width: 0.1 }] };
  expect(readPianoAttacks(geometry, [head], { bottom: 0, space: 1 }, [], 4)?.[0]?.beats).toBe(0.5);
});

test('keeps a whole-note second on the displaced side in its chord', () => {
  const heads = [glyph(1.4, 0.5, '\ue0a2'), glyph(0, 0, '\ue0a2'), glyph(0, 1.5, '\ue0a2')];
  const geometry = { glyphs: heads, fills: [], curvedFills: [], segments: [] };
  const attacks = readPianoAttacks(geometry, heads, { bottom: 0, space: 1 }, [], 4);
  expect(attacks).toHaveLength(1);
  expect(attacks?.[0].heads).toHaveLength(3);
});

test('keeps the aligned upper whole-note heads with the displaced note defining the second', () => {
  const heads = [glyph(0, 0, '\ue0a2'), glyph(1.392, 0.5, '\ue0a2'),
    glyph(1.3916, 2, '\ue0a2'), glyph(1.3916, 3.5, '\ue0a2')];
  const geometry = { glyphs: heads, fills: [], curvedFills: [], segments: [] };
  const attacks = readPianoAttacks(geometry, heads, { bottom: 0, space: 1 }, [], 4);
  expect(attacks?.map(a => a.heads.map(h => h.y).sort((a, b) => a - b))).toEqual([[0, 0.5, 2, 3.5]]);
});

test.each([0, 1, 2])('requires both nearby bracket hooks for a triplet with a rest at index %i', restIndex => {
  const row = [0, 4, 8].map((x, i) => glyph(x, 0, i === restIndex ? '\ue4e5' : '\ue0a4'));
  const stems = row.filter((_, i) => i !== restIndex)
    .map(g => ({ x1: g.x + 1.24, x2: g.x + 1.24, y1: .16, y2: 3.5, width: .1 }));
  const read = (height: number, hooks: number[]) => {
    const segments = [...stems, ...[[0, 3.4], [5, 8]].map(([x1, x2]) => ({
      x1: x1, x2: x2, y1: height, y2: height, width: .1 })),
      ...hooks.map(x => ({ x1: x, x2: x, y1: height, y2: height - .75, width: .1 }))];
    const geometry = { glyphs: [...row, glyph(4, height, '3', 'Edwin-Italic')], segments, fills: [], curvedFills: [] };
    return readPianoAttacks(geometry, row, { bottom: 0, space: 1 }, [], 4)?.map(a => a.beats);
  };
  expect(read(4.5, [0, 8])).toEqual([2 / 3, 2 / 3, 2 / 3]);
  expect(read(4.5, [0])).toEqual([1, 1, 1]);
  expect(read(4.5, [8])).toEqual([1, 1, 1]);
  expect(read(12, [0, 8])).toEqual([1, 1, 1]);
});
