import { describe, expect, it } from 'vitest';
import type { PdfGlyph } from '../src/infrastructure/parsers/pdf/geometry';
import { musicGlyphCode } from '../src/infrastructure/parsers/pdf/musicGlyphs';

function glyph(font: string, codepoint: number, code = 1): PdfGlyph {
  return { font, code, text: String.fromCodePoint(codepoint), size: 20, x: 0, y: 0 };
}

describe('PDF music glyph encoding', () => {
  it('decodes Emmentaler using mapped text across PDF subsets', () => {
    expect(musicGlyphCode(glyph('MScore', 0xe12d, 5))).toBe(0xe0a4);
    expect(musicGlyphCode(glyph('MScore', 0xe12d, 27))).toBe(0xe0a4);
    expect(musicGlyphCode(glyph('MScore', 0x32))).toBe(0xe082);
  });

  it('distinguishes augmentation, articulation and repeat dots', () => {
    expect(musicGlyphCode(glyph('MScore', 0xe127))).toBe(0xe1e7);
    expect(musicGlyphCode(glyph('MScore', 0xe4a2))).toBe(0xe4a2);
    expect(musicGlyphCode(glyph('MScore', 0xe043))).toBe(0xe044);
  });

  it('leaves SMuFL text intact and ignores unmapped Emmentaler codepoints', () => {
    expect(musicGlyphCode(glyph('Bravura', 0xe0a2))).toBe(0xe0a2);
    expect(musicGlyphCode(glyph('MScore', 0xe0a2))).toBe(0);
    expect(musicGlyphCode(glyph('MScoreText', 0xe520))).toBe(0xe520);
  });
});
