import { expect, test } from 'vitest';
import type { PdfGeometry, PdfGlyph } from '../../../src/infrastructure/parsers/pdf/geometry';
import { lilyPondAttacks } from '../../../src/infrastructure/parsers/pdf/lilyPondAttacks';
import { timeLilyPondStaves } from '../../../src/infrastructure/parsers/pdf/lilyPondTiming';
import type { PianoAttack } from '../../../src/infrastructure/parsers/pdf/pianoAttacks';

function glyph(x: number, y: number, code: number): PdfGlyph {
  return { font: 'Emmentaler-20', x, y, text: String.fromCodePoint(code), size: 4, code };
}

test('an augmentation dot displaced above a shared head belongs to its upward stem', () => {
  const head = glyph(0, 0, 0xe0a4);
  const geometry: PdfGeometry = {
    glyphs: [head, glyph(2.6, 0.5, 0xe1e7), glyph(1.24, 3.5, 0xe240), glyph(0.055, -3.5, 0xe243)],
    fills: [], curvedFills: [],
    segments: [{ x1: 1.24, x2: 1.24, y1: 0.16, y2: 3.5, width: .07 },
      { x1: .055, x2: .055, y1: -.16, y2: -3.5, width: .07 }],
  };
  const attacks = lilyPondAttacks(geometry, geometry.glyphs, { bottom: 0, space: 1 }, [], 4);
  expect(attacks?.filter(a => !a.hiddenHead)).toHaveLength(1);
  expect(attacks?.map(a => [a.stem?.up, a.beats])).toEqual([[false, .25], [true, .75]]);
});

test('opposing stems preserve the onset of a displaced second and the rest in its voice', () => {
  const attacks: PianoAttack[] = [
    { x: 0, stem: { x: 1.24, far: 4, up: true }, heads: [glyph(0, 1, 0xe0a3)], beams: [],
      duration: { value: 'half', dots: 0 }, beats: 2 },
    { x: 1.32, stem: { x: 1.375, far: -3, up: false }, heads: [glyph(1.32, .5, 0xe0a4)], beams: [],
      duration: { value: 'quarter', dots: 0 }, beats: 1 },
    { x: 5, rest: glyph(5, 0, 0xe4e5), heads: [], beams: [], duration: { value: 'quarter', dots: 0 }, beats: 1 },
  ];
  expect(timeLilyPondStaves([attacks], 1, 2, false)?.[0]?.timed.map(t => [t.beat, t.voice]))
    .toEqual([[0, 0], [0, 1], [1, 1]]);
});
