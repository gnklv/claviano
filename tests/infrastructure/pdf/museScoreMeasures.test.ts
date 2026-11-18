import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry, type PdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { museScoreMeasures } from '../../../src/infrastructure/parsers/pdf/museScoreMeasures';

test('reads joined staff spans, keeping a measure even when its terminal barline is absent', () => {
  const page: PdfGeometry = { glyphs: [], segments: [], fills: [], curvedFills: [] };
  for (const bottom of [500, 440, 350, 290]) {
    for (const [x1, x2] of [[40, 200], [200, 600]]) {
      for (let line = 0; line < 5; line++) {
        const y = bottom + line * 5;
        page.segments.push({ x1, x2, y1: y, y2: y, width: 0.5 });
      }
    }
  }
  page.segments.push({ x1: 199.5, x2: 199.5, y1: 520, y2: 440, width: 1 });
  page.glyphs.push(
    { x: 38, y: 380, font: 'Edwin-Italic', size: 8, code: 1, text: '1' },
    { x: 42, y: 380, font: 'Edwin-Italic', size: 8, code: 0, text: '0' },
    { x: 50, y: 365, font: 'Leland', size: 20, code: 2, text: '2' },
  );
  expect(museScoreMeasures(page).map(({ left, right, system, systemStart, printedNumber }) =>
    [left, right, system, systemStart, printedNumber])).toEqual([
    [40, 200, 0, true, undefined], [200, 600, 0, false, undefined],
    [40, 200, 1, true, 10], [200, 600, 1, false, undefined],
  ]);
});

const samples = [
  ['czardas', [20, 28, 32, 24, 30]],
  ['golden-hour-jvke-updated-ver', [18, 17, 20, 16, 33]],
] as const;

for (const [name, pageLengths] of samples) {
  const path = `samples/${name}.pdf`;
  test.skipIf(!existsSync(path))(`maps every printed measure and system number in ${name}`, () => {
    const pdf = readPdf(readFileSync(path));
    expect(pdf.pageCount).toBe(pageLengths.length);
    let number = 1;
    for (const [index, length] of pageLengths.entries()) {
      const measures = museScoreMeasures(extractPdfGeometry(pdf.page(index)));
      expect(measures).toHaveLength(length);
      for (const measure of measures) {
        if (measure.systemStart && number > 1) expect(measure.printedNumber).toBe(number);
        number++;
      }
    }
  });
}
