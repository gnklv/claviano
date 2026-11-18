import { describe, expect, it } from 'vitest';
import type { PdfContent } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';

const fonts = new Map([
  ['F', {
    name: 'Music', unicode: new Map([[1, 'a'], [40, 'b'], [92, 'c']]),
    codeBytes: 2, widths: new Map([[1, 500], [40, 750]]),
  }],
]);

function content(operators: string, forms = new Map<string, PdfContent>()): PdfContent {
  return { operators, fonts, form: name => forms.get(name) };
}

describe('PDF score drawing geometry', () => {
  it('positions encoded glyphs through the page and text matrices, text widths and TJ offsets', () => {
    const geometry = extractPdfGeometry(content(String.raw`
      2 0 0 2 10 20 cm
      BT /F 10 Tf 1 0 0 1 20 30 Tm
      [(\000\001) 100 (\000\() <005C>] TJ
      2 -5 Td <0001> Tj
      3 TL T* <0028> Tj ET
    `));
    expect(geometry.glyphs).toEqual([
      { text: 'a', code: 1, font: 'Music', textObject: 1, x: 50, y: 80, size: 20 },
      { text: 'b', code: 40, font: 'Music', textObject: 1, x: 58, y: 80, size: 20 },
      { text: 'c', code: 92, font: 'Music', textObject: 1, x: 73, y: 80, size: 20 },
      { text: 'a', code: 1, font: 'Music', textObject: 1, x: 54, y: 70, size: 20 },
      { text: 'b', code: 40, font: 'Music', textObject: 1, x: 54, y: 64, size: 20 },
    ]);
  });

  it('extracts straight painted paths and preserves the graphics state across forms', () => {
    const form = {
      ...content('0 0 m 4 2 l 4 3 l 0 1 l 0 0 l f* 0 0 m 0 7 l S'),
      matrix: [1, 0, 0, 1, 3, 5],
    };
    const geometry = extractPdfGeometry(content(`
      2 w 0 0 m 10 0 l S
      q 2 0 0 2 10 20 cm /Score Do Q
      0 10 m 10 10 l S
      0 0 m 2 2 3 3 4 4 c 6 6 l 0 0 l f
      0 0 5 5 re n
    `, new Map([['Score', form]])));
    expect(geometry.fills).toEqual([[
      { x: 16, y: 30 }, { x: 24, y: 34 }, { x: 24, y: 36 }, { x: 16, y: 32 },
    ]]);
    expect(geometry.segments).toEqual([
      { x1: 0, y1: 0, x2: 10, y2: 0, width: 2 },
      { x1: 16, y1: 30, x2: 16, y2: 44, width: 4 },
      { x1: 0, y1: 10, x2: 10, y2: 10, width: 2 },
    ]);
  });

  it('preserves transformed Bézier controls on filled contours', () => {
    const geometry = extractPdfGeometry(content(`
      2 0 0 2 10 20 cm
      0 0 m 2 1 4 1 6 0 c 4 2 2 2 0 0 c h f
      0 0 m 1 0 l 2 1 3 1 4 0 c f
    `));
    expect(geometry.curvedFills).toEqual([[
      { from: { x: 10, y: 20 }, control1: { x: 14, y: 22 }, control2: { x: 18, y: 22 }, to: { x: 22, y: 20 } },
      { from: { x: 22, y: 20 }, control1: { x: 18, y: 24 }, control2: { x: 14, y: 24 }, to: { x: 10, y: 20 } },
    ]]);
    expect(geometry.fills).toEqual([]);
  });
});
