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
  expect(read()?.map(a => [a.beats, a.tupletPart])).toEqual([[1 / 3, 'start'], [1 / 3, 'continue'], [1 / 3, 'stop']]);
  geometry.glyphs.pop();
  expect(read()?.map(a => a.beats)).toEqual([0.5, 0.5, 0.5]);
});

test('reads a number on the head side of a down-stemmed beamed triplet', () => {
  const heads = [0, 3, 6].map(x => glyph(x, 0, '\ue0a4'));
  const number = glyph(3, 1.1, '3', 'CenturySchL-Ital');
  const geometry: PdfGeometry = { glyphs: [...heads, number], fills: [], curvedFills: [],
    segments: heads.map(h => ({ x1: h.x + .065, x2: h.x + .065, y1: -3.6, y2: -.16, width: .1 })) };
  const beams = [{ left: .065, right: 6.065, yAt: () => -3.6 }];
  const attacks = readPianoAttacks(geometry, heads, { bottom: -2, space: 1 }, beams, 1);
  expect(attacks?.map(a => a.beats)).toEqual([1 / 3, 1 / 3, 1 / 3]);
});

test('uses the flag touching a stem tip across the staff midpoint', () => {
  const head = glyph(0, 0, '\ue0a4');
  const geometry = { glyphs: [head, glyph(1.24, 6, '\ue240')], fills: [], curvedFills: [],
    segments: [{ x1: 1.24, x2: 1.24, y1: 0.16, y2: 6, width: 0.1 }] };
  expect(readPianoAttacks(geometry, [head], { bottom: 0, space: 1 }, [], 4)?.[0]?.beats).toBe(0.5);
});

test('attaches a reduced chord head to a stem established by a full-size head', () => {
  const full = glyph(0, 0, '\ue0a4');
  const reduced = { ...glyph(0.375, 1.5, '\ue0a4'), size: 2.8 };
  const geometry = { glyphs: [full, reduced], fills: [], curvedFills: [],
    segments: [{ x1: 1.24, x2: 1.24, y1: 0.16, y2: 3.9, width: 0.1 }] };
  const staff = { bottom: 0, space: 1 };

  expect(readPianoAttacks(geometry, [full, reduced], staff, [], 4)?.map(attack => attack.heads))
    .toEqual([[full, reduced]]);
  expect(readPianoAttacks(geometry, [reduced], staff, [], 4)).toBeNull();
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

test('reads both augmentation dots beside two displaced unison heads', () => {
  const upper = glyph(0, 0, '\ue0a4');
  const lower = glyph(1.6, 0, '\ue0a3');
  const dots = [glyph(3.25, 0.5, '\ue1e7'), glyph(3.25, -0.5, '\ue1e7')];
  const segments = [{ x1: 1.24, x2: 1.24, y1: 0.16, y2: 3.5, width: 0.1 },
    { x1: 1.655, x2: 1.655, y1: -0.16, y2: -3.5, width: 0.1 }];
  const read = (glyphs: PdfGlyph[]) => readPianoAttacks(
    { glyphs, segments, fills: [], curvedFills: [] }, glyphs, { bottom: 0, space: 1 }, [], 3);
  expect(read([upper, lower, ...dots])?.map(a => a.beats)).toEqual([1.5, 3]);
  expect(read([upper, lower, dots[0]])?.map(a => a.beats)).toEqual([1, 3]);
});

test('reads two unequal triplet members across a stem reversal', () => {
  const row = [glyph(0, 0, '\ue0a4'), glyph(6, 0, '\ue0a4')];
  const segments = [[1.24, .16, 1.24, 3.5], [6.055, -.16, 6.055, -3.5],
    [0, 4, 0, 5], [0, 5, 2.5, 5], [4.5, 5, 7.2, 5], [7.2, 5, 7.2, 4]]
    .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, width: .1 }));
  const geometry = { glyphs: [...row, glyph(6.055, -3.5, '\ue241'), glyph(3, 4.5, '3', 'Edwin-Italic')],
    fills: [], curvedFills: [], segments };
  const read = () => readPianoAttacks(geometry, row, { bottom: 0, space: 1 }, [], 1);
  expect(read()?.map(a => [a.beats, a.tupletPart])).toEqual([[2 / 3, 'start'], [1 / 3, 'stop']]);
  segments.pop();
  expect(read()?.map(a => a.beats)).toEqual([1, .5]);
});

test('a single triplet number covers six subdivisions sharing a beam', () => {
  const heads = Array.from({ length: 6 }, (_, i) => glyph(i * 2, 0, '\ue0a4'));
  const geometry = { glyphs: [...heads, glyph(5.7, 4.5, '3', 'Edwin-Italic')], fills: [], curvedFills: [],
    segments: heads.map(h => ({ x1: h.x + 1.24, x2: h.x + 1.24, y1: .16, y2: 3.5, width: .1 })) };
  const beams = [3.5, 2.75].map(y => ({ left: 1.24, right: 11.24, yAt: () => y }));
  const attacks = readPianoAttacks(geometry, heads, { bottom: 0, space: 1 }, beams, 1);
  expect(attacks?.map(a => a.beats)).toEqual(Array(6).fill(1 / 6));
  expect(attacks?.map(a => a.tupletPart)).toEqual(['start', 'continue', 'continue', 'continue', 'continue', 'stop']);
});

test('a secondary beam break ends a triplet inside a longer primary beam', () => {
  const heads = Array.from({ length: 5 }, (_, i) => glyph(i * 2, 0, '\ue0a4'));
  const geometry = { glyphs: [...heads, glyph(2.7, 4.5, '3', 'Edwin-Italic')], fills: [], curvedFills: [],
    segments: heads.map(h => ({ x1: h.x + 1.24, x2: h.x + 1.24, y1: .16, y2: 3.5, width: .1 })) };
  const beams = [{ left: 1.24, right: 9.24, yAt: () => 3.5 },
    { left: 1.24, right: 5.24, yAt: () => 2.75 }, { left: 7.24, right: 9.24, yAt: () => 2.75 }];
  const attacks = readPianoAttacks(geometry, heads, { bottom: 0, space: 1 }, beams, 1);
  expect(attacks?.map(a => a.beats)).toEqual([1 / 6, 1 / 6, 1 / 6, .25, .25]);
});

test('one triplet digit can belong to only one of two aligned beamed voices', () => {
  const xs = [0, 3, 6];
  const heads = xs.flatMap(x => [glyph(x, 0, '\ue0a4'), glyph(x, -1, '\ue0a4')]);
  const segments = xs.flatMap(x => [
    { x1: x + 1.24, x2: x + 1.24, y1: .16, y2: 3.5, width: .1 },
    { x1: x + .055, x2: x + .055, y1: -1.16, y2: -4.5, width: .1 },
  ]);
  const beams = [{ left: 1.24, right: 7.24, yAt: () => 3.5 }, { left: .055, right: 6.055, yAt: () => -4.5 }];
  const read = (y: number) => readPianoAttacks({ glyphs: [...heads, glyph(3.3, y, '3', 'Edwin-Italic')],
    segments, fills: [], curvedFills: [] }, heads, { bottom: 0, space: 1 }, beams, 1)!;
  expect(read(0).filter(a => a.stem?.up).map(a => a.beats)).toEqual(Array(3).fill(1 / 3));
  expect(read(0).filter(a => !a.stem?.up).map(a => a.beats)).toEqual(Array(3).fill(.5));
  expect(read(-.5).every(a => !a.tupletPart)).toBe(true);
});
