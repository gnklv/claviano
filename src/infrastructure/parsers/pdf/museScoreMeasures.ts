import type { PdfGeometry, PdfGlyph } from './geometry';
import { pianoStaffPairs, sortedX, top, within, type Measure } from './pianoGeometry';

export interface MuseScoreMeasure extends Measure {
  /** Zero-based index of the system on this page. */
  readonly system: number;
  readonly systemStart: boolean;
  readonly printedNumber?: number;
}

function systemNumber(glyphs: readonly PdfGlyph[], measure: Measure): number | undefined {
  const upper = measure.staves[0];
  const space = upper.space;
  const digits = sortedX(glyphs.filter(glyph => /^\d$/.test(glyph.text)
    && within(glyph.size, space * 1.6, space * 0.22)
    && within(glyph.x, measure.left, space * 1.4)
    && within(glyph.y - top(upper), space * 2.2, space * 0.35)));
  const first = digits[0];
  if (!first || !digits.every((digit, index) => digit.font === first.font
    && within(digit.y, first.y, space * 0.1)
    && (index === 0 || within(digit.x - digits[index - 1]!.x, space * 0.85, space * 0.2)))) {
    return undefined;
  }
  return Number(digits.map(digit => digit.text).join('')) || undefined;
}

/** MuseScore draws each written measure as a pair of five-line staff spans.
 * Their common endpoints delimit measures even if an ending barline is hidden
 * or a double barline appears slightly inside the span. */
export function museScoreMeasures(page: PdfGeometry): MuseScoreMeasure[] {
  const measures = pianoStaffPairs(page.segments).sort((a, b) =>
    b.staves[0].bottom - a.staves[0].bottom || a.left - b.left);
  let system = -1;
  let previous: Measure | undefined;
  return measures.map(measure => {
    const systemStart = !previous || !within(measure.staves[0].bottom, previous.staves[0].bottom, 0.04);
    if (systemStart) system++;
    previous = measure;
    const printedNumber = systemStart ? systemNumber(page.glyphs, measure) : undefined;
    return { ...measure, system, systemStart, printedNumber };
  });
}
