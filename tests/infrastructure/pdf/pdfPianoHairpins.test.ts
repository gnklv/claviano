// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { isHead, pianoStaffPairs, sortedX, top } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { readBarHairpins } from '../../../src/infrastructure/parsers/pdf/pianoHairpins';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';
import { bytes, parser } from '../../support/musicXmlScore';

test('reads both engraved showcase wedges and preserves the final barline stop on reopening', () => {
  const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
  const measures = pianoStaffPairs(geometry.segments);
  const reference = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'Showcase').notation;
  const hairpins = [3, 5].flatMap(index => {
    const measure = measures[index];
    const bar = reference.bars[index];
    const middle = (measure.staves[0].bottom + top(measure.staves[1])) / 2;
    const heads = sortedX(geometry.glyphs.filter(glyph => isHead(glyph) && glyph.x > measure.left
      && glyph.x < measure.right && glyph.y > middle && glyph.y < top(measure.staves[0]) + measure.staves[0].space * 4));
    const notes = reference.notes.filter(note => note.bar === index && note.staff === 1);
    expect(heads).toHaveLength(notes.length);
    const result = readBarHairpins(geometry, measure, bar, heads.map(({ x }, i) => ({ x, beat: notes[i].beat })));
    expect(result).toEqual(reference.hairpins.filter(pin => pin.start >= bar.start && pin.start < bar.start + bar.length));
    return result ?? [];
  });
  const bars = reference.bars.slice(0, 6);
  const end = bars.at(-1)!.start + bars.at(-1)!.length;
  const notation = { ...reference, bars, hairpins, notes: reference.notes.filter(note => note.bar < bars.length),
    rests: reference.rests.filter(rest => rest.beat < end) };
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(notation)), 'Preview').notation;
  expect(reopened.hairpins).toEqual(hairpins);
});
