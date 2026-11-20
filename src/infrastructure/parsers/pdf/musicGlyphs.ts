import type { PdfGeometry, PdfGlyph } from './geometry';

// MuseScore 2 Emmentaler codepoints, matched by glyph name to the SMuFL registry.
// https://github.com/musescore/MuseScore/blob/v2.3.2/fonts/mscore/glyphnames.json
// https://github.com/w3c/smufl/blob/gh-pages/metadata/glyphnames.json
const mscoreToSmufl = new Map([
  [0xe843, 0xe843], // guitarFadeIn
  [0xe844, 0xe844], // guitarFadeOut
  [0xe043, 0xe044], // repeatDot
  [0xe09a, 0xe08a], // timeSigCommon
  [0xe09b, 0xe08b], // timeSigCutCommon
  [0xe100, 0xe4e3], // restWhole
  [0xe101, 0xe4e4], // restHalf
  [0xe102, 0xe4f4], // restWholeLegerLine
  [0xe103, 0xe4f5], // restHalfLegerLine
  [0xe107, 0xe4e5], // restQuarter
  [0xe109, 0xe4e6], // rest8th
  [0xe10a, 0xe4e7], // rest16th
  [0xe10b, 0xe4e8], // rest32nd
  [0xe10e, 0xe262], // accidentalSharp
  [0xe113, 0xe261], // accidentalNatural
  [0xe114, 0xe260], // accidentalFlat
  [0xe11a, 0xe264], // accidentalDoubleFlat
  [0xe11c, 0xe263], // accidentalDoubleSharp
  [0xe127, 0xe1e7], // augmentationDot
  [0xe12b, 0xe0a2], // noteheadWhole
  [0xe12c, 0xe0a3], // noteheadHalf
  [0xe12d, 0xe0a4], // noteheadBlack
  [0xe158, 0xe4c0], // fermataAbove
  [0xe159, 0xe4c1], // fermataBelow
  [0xe171, 0xe566], // ornamentTrill
  [0xe181, 0xeaad], // wiggleArpeggiatoUpArrow
  [0xe17e, 0xeaa9], // wiggleArpeggiatoUp (shared with wiggleArpeggiatoDown in Emmentaler)
  [0xe190, 0xe240], // flag8thUp
  [0xe191, 0xe242], // flag16thUp
  [0xe192, 0xe244], // flag32ndUp
  [0xe194, 0xe241], // flag8thDown
  [0xe195, 0xe564], // graceNoteSlashStemUp
  [0xe196, 0xe565], // graceNoteSlashStemDown
  [0xe197, 0xe243], // flag16thDown
  [0xe198, 0xe245], // flag32ndDown
  [0xe19a, 0xe05c], // cClef
  [0xe19c, 0xe062], // fClef
  [0xe19e, 0xe050], // gClef
  [0xe1a6, 0xe655], // keyboardPedalUp
  [0xe1ac, 0xe650], // keyboardPedalPed
]);

export function isLegacyMusicGlyph(glyph: PdfGlyph): boolean {
  return glyph.font === 'MScore' && glyph.musicEncoding !== 'smufl';
}

/** Decode the music symbol from the PDF's Unicode mapping, independent of subset character IDs. */
export function musicGlyphCode(glyph: PdfGlyph): number {
  const code = glyph.text.codePointAt(0) ?? 0;
  if (!isLegacyMusicGlyph(glyph)) return code;
  if (code >= 0x30 && code <= 0x39) return 0xe080 + code - 0x30;
  // Accent, staccato, and tenuto use the same assignments in Emmentaler and SMuFL.
  if (code >= 0xe4a0 && code <= 0xe4a5) return code;
  return mscoreToSmufl.get(code) ?? 0;
}

/** MuseScore exports exist with both the historical and SMuFL character sets under
 * the MScore family name. Identify the encoding by the printed clefs and heads. */
export function identifyMusicEncoding(page: PdfGeometry): PdfGeometry {
  const symbols = page.glyphs.filter(g => g.font === 'MScore');
  const codes = new Set(symbols.map(g => g.text.codePointAt(0)));
  if ((codes.has(0xe050) || codes.has(0xe062)) && !codes.has(0xe19e) && !codes.has(0xe19c)
    && (codes.has(0xe0a4) || codes.has(0xe0a3) || codes.has(0xe0a2))) {
    for (const glyph of symbols) glyph.musicEncoding = 'smufl';
  }
  return page;
}
