import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pageContent, readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';

function pdf(objects: (string | Buffer)[]): Buffer {
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = ['0000000000 65535 f \n'];
  let position = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(`${String(position).padStart(10, '0')} 00000 n \n`);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(object), Buffer.from('\nendobj\n')]);
    parts.push(part);
    position += part.length;
  }
  parts.push(Buffer.from(
    `xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`,
  ));
  return Buffer.concat(parts);
}

function stream(operators: string, entries = ''): Buffer {
  const data = deflateSync(Buffer.from(operators, 'latin1'));
  return Buffer.concat([
    Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode ${entries} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ]);
}

describe('readPdf', () => {
  it('reads pages in tree order and preserves bytes and content stream order', () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [4 0 R 3 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
      '<< /Type /Page /Parent 2 0 R /Contents [6 0 R 7 0 R] >>',
      stream('10 10 m'),
      stream('BT (\x00\x80) Tj'),
      '<< /Length 8 0 R >>\nstream\nET\nendstream',
      '2',
    ]);
    const document = readPdf(bytes);
    expect(document.pageCount).toBe(2);
    expect(pageContent(bytes, 0)).toBe('BT (\x00\x80) Tj\nET');
    expect(document.page(1).operators).toBe('10 10 m');
    expect(() => document.page(2)).toThrow(/page index/);
  });

  it('finds a form in inherited resources and resolves its local font map and widths', () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /XObject << /TPL0 5 0 R >> >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>',
      stream('/TPL0 Do'),
      stream('/R1 12 Tf <000100020003> Tj', '/Subtype /Form /Matrix [1 0 0 1 10 20] /Resources << /Font << /R1 6 0 R >> >>'),
      '<< /Subtype /Type0 /BaseFont /ABCDEF+Leland /ToUnicode 7 0 R /DescendantFonts [8 0 R] >>',
      stream('1 beginbfchar\n<0001><E050>\nendbfchar\n1 beginbfrange\n<0002><0003><E0A3>\nendbfrange'),
      '<< /DW 250 /W [1 [300 320] 3 4 350] >>',
    ]);
    const page = readPdf(bytes).page(0);
    expect(page.operators).toBe('/TPL0 Do');
    expect(page.fonts.size).toBe(0);
    expect(page.form('unknown')).toBeUndefined();
    const form = page.form('TPL0');
    expect(form?.matrix).toEqual([1, 0, 0, 1, 10, 20]);
    expect(form?.operators).toBe('/R1 12 Tf <000100020003> Tj');
    expect(form?.fonts.get('R1')).toEqual({
      name: 'Leland', codeBytes: 2, unicode: new Map([[1, '\uE050'], [2, '\uE0A3'], [3, '\uE0A4']]),
      widths: new Map([[1, 300], [2, 320], [3, 350], [4, 350]]), defaultWidth: 250,
    });
  });

  it.each(['Type1', 'TrueType'])('advances simple %s glyphs by their declared widths', (subtype) => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F 5 0 R >> >> >>',
      stream('BT /F 10 Tf (ABCA) Tj ET'),
      `<< /Subtype /${subtype} /FirstChar 65 /LastChar 66 /Widths 6 0 R /FontDescriptor << /MissingWidth 400 >> >>`,
      '[500 600]',
    ]);
    expect(extractPdfGeometry(readPdf(bytes).page(0)).glyphs.map(g => g.x)).toEqual([0, 5, 11, 15]);
  });

  it('rejects a broken content stream length before decoding', () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>',
      '<< /Length 300 >>\nstream\n12 12 m\nendstream',
    ]);
    expect(() => pageContent(bytes, 0)).toThrow(/truncated stream/);
  });
});
