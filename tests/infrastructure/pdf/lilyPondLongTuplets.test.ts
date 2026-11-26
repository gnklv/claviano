import { expect, test } from 'vitest';
import type { PdfGeometry, PdfGlyph } from '../../../src/infrastructure/parsers/pdf/geometry';
import { numberedLongBeams } from '../../../src/infrastructure/parsers/pdf/lilyPondLongTuplets';
import type { PianoAttack } from '../../../src/infrastructure/parsers/pdf/pianoAttacks';

function printedGroup(label: string, split: number, extraAttack = false) {
  const staves = [{ bottom: 95, space: 5, left: 0, right: 80 }];
  const measures = [{ left: 0, right: split, systemStart: true, staves },
    { left: split, right: 80, systemStart: false, staves }];
  const beam = { left: 10, right: 65, yAt: () => 90 };
  const digits: PdfGlyph[] = [...label].map((text, i) => ({
    text, x: 34 + i * 3, y: 83, textObject: 1, font: 'Italic', code: text.charCodeAt(0), size: 7,
  }));
  const heads = Array.from({ length: 12 }, (_, i) => ({ x: 9.725 + 5 * i, y: 110,
    code: 1, text: '\ue0a4', size: 20, font: 'Emmentaler' }));
  const geometry: PdfGeometry = { glyphs: [...digits, ...heads], fills: [], curvedFills: [],
    segments: heads.map(h => ({ x1: h.x + .275, x2: h.x + .275, y1: 90, y2: 109.2, width: .4 })) };
  const attacks: PianoAttack[] = heads.map(h => ({ x: h.x, heads: [h], duration: { value: 'eighth', dots: 0 },
    beats: .5, beams: ['continue'], stem: { x: h.x + .275, up: false, far: 90 } }));
  if (extraAttack) attacks.unshift({ ...attacks[0], x: 5 });
  return numberedLongBeams(geometry, [beam], 5, measures,
    m => attacks.filter(a => a.x > m.left && a.x < m.right));
}

test('requires the centered number to count all stems over complete, evenly filled bars', () => {
  expect(printedGroup('12', 38)).toHaveLength(1);
  expect(printedGroup('13', 38)).toHaveLength(0);
  expect(printedGroup('02', 38)).toHaveLength(0);
  expect(printedGroup('12', 45)).toHaveLength(0);
  expect(printedGroup('12', 38, true)).toHaveLength(0);
});
