// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ScoreLoadError } from '../../../src/application/ports/ScoreParser';
import { LoadScore } from '../../../src/application/use-cases/LoadScore';
import type { Notation } from '../../../src/domain/notation/notation';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { PdfScoreParser } from '../../../src/infrastructure/parsers/PdfScoreParser';
import type { PdfContent } from '../../../src/infrastructure/parsers/pdf/document';
import { readPianoDocumentPreview, readPianoPreview } from '../../../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';

const loader = new LoadScore([new PdfScoreParser(), new MusicXmlParser()]);

function engraving(barLengths: number[], options: { meterChange?: boolean; keyAndClefChange?: boolean } = {}): PdfContent {
  const right = 10 + barLengths.length * 100;
  const operators = Array.from({ length: 5 }, (_, i) => {
    const y = 100 + i * 5;
    return `10 ${y} m ${right} ${y} l S`;
  });
  const glyph = (code: string, x: number, y: number) => {
    operators.push(`BT /Music 20 Tf 1 0 0 1 ${x} ${y} Tm <${code}> Tj ET`);
  };
  glyph('01', 12, 105);
  glyph('02', 21, 120);
  glyph('03', 29, 110);
  if (options.meterChange) {
    glyph('05', 124, 115);
    glyph('06', 124, 105);
  }
  if (options.keyAndClefChange) {
    glyph('07', 122, 120);
    glyph('08', 153, 115);
  }
  for (const [index, length] of barLengths.entries()) {
    const left = 10 + index * 100;
    operators.push(`${left} 100 m ${left} 120 l S`);
    for (let beat = 0; beat < length; beat++) {
      const x = left + 35 + beat * 15;
      glyph('04', x, 120);
      operators.push(`${x + 6.1} 120 0.3 15 re f`);
    }
  }
  operators.push(`${right} 100 m ${right} 120 l S`);
  const unicode = new Map(['\ue050', '\ue262', '\ue08a', '\ue0a4', '\ue083', '\ue084', '\ue261', '\ue07c']
    .map((symbol, i) => [i + 1, symbol]));
  return { operators: operators.join('\n'),
    fonts: new Map([['Music', { name: 'Emmentaler-20', unicode, codeBytes: 1 }]]), form: () => undefined };
}

test('keeps the active key through a mid-system meter change', () => {
  const page = engraving([4, 3], { meterChange: true });
  const reading = readPianoDocumentPreview({ pageCount: 1, page: () => page }, 'Meter change');
  expect(reading?.coverage).toBe('full');
  expect(reading?.notation.timeSignatures).toEqual([
    { beat: 0, numerator: 4, denominator: 4 }, { beat: 4, numerator: 3, denominator: 4 },
  ]);
  expect(reading?.notation.keySignatures).toEqual([{ beat: 0, fifths: 1, minor: false }]);
  expect(reading?.notation.notes.map(note => note.sounding)).toEqual(Array(7).fill(78));
});

test('reads an opening key change before a clef change later in the measure', () => {
  const page = engraving([4, 4], { keyAndClefChange: true });
  const reading = readPianoDocumentPreview({ pageCount: 1, page: () => page }, 'Key and clef change');
  expect(reading?.coverage).toBe('full');
  expect(reading?.notation.keySignatures.map(key => [key.beat, key.fifths])).toEqual([[0, 1], [4, 0]]);
  expect(reading?.notation.clefs.map(clef => [clef.beat, clef.clef])).toEqual([[0, 'treble'], [5, 'bass']]);
  expect(reading?.notation.notes.find(note => note.beat === 4)?.sounding).toBe(77);
});

test('accepts a final short measure that complements the opening pickup', () => {
  const page = engraving([1, 4, 3]);
  const reading = readPianoDocumentPreview({ pageCount: 1, page: () => page }, 'Pickup');
  expect(reading?.coverage).toBe('full');
  expect(reading?.notation.pickup).toBe(true);
  expect(reading?.notation.bars.map(bar => [bar.start, bar.length])).toEqual([[0, 1], [1, 4], [5, 3]]);
  const xml = writePdfPreviewMusicXml(reading!.notation);
  const reopened = loader.execute('pickup.musicxml', new TextEncoder().encode(xml).buffer);
  expect(reopened.notation.bars.map(bar => bar.length)).toEqual([1, 4, 3]);

  const mismatch = readPianoDocumentPreview({ pageCount: 1, page: () => engraving([1, 4, 2]) }, 'Pickup');
  expect(mismatch?.coverage).toBe('partial');
  expect(mismatch?.notation.bars.map(bar => bar.length)).toEqual([1, 4]);
});

test('does not count a complementary short measure at a preview or extraction cutoff', () => {
  const interiorShort = engraving([1, 4, 4, 3, 4]);
  const fragment = readPianoPreview(interiorShort, 'Pickup');
  expect(fragment?.bars.map(bar => bar.length)).toEqual([1, 4, 4]);
  const complete = readPianoDocumentPreview({ pageCount: 1, page: () => interiorShort }, 'Pickup');
  expect(complete?.coverage).toBe('partial');
  expect(complete?.notation.bars.map(bar => bar.length)).toEqual([1, 4, 4]);

  const page = engraving([1, 4, 3]);
  const reading = readPianoDocumentPreview({ pageCount: 2, page: index => {
    if (index === 0) return page;
    throw new ScoreLoadError('unsupported-feature', 'Unreadable page');
  } }, 'Pickup');
  expect(reading?.coverage).toBe('partial');
  expect(reading?.notation.bars.map(bar => bar.length)).toEqual([1, 4]);
});

function writtenMeasures(notation: Notation): string[] {
  const measures = notation.bars.map((): string[] => []);
  for (const { bar, staff, sounding, beat, beats } of notation.notes) {
    measures[bar].push([staff, sounding, beat - notation.bars[bar].start, beats].join('/'));
  }
  return measures.map(notes => notes.sort().join(' '));
}

test.each([999, 928, 870])('imports BWV %i and reopens the MusicXML with the original notes and rhythm', id => {
  const base = 'tests/fixtures/pdf/lilypond/bwv' + id;
  const expected = readFileSync(base + '.notes', 'utf8').trim().split('\n');
  const score = loader.execute(base + '.pdf', Uint8Array.from(readFileSync(base + '.pdf')).buffer);
  expect(writtenMeasures(score.notation)).toEqual(expected);
  const xml = writePdfPreviewMusicXml(score.notation);
  expect(xml).toContain(`<staves>${id === 999 ? 1 : 2}</staves>`);
  const reopened = loader.execute('reopened.musicxml', new TextEncoder().encode(xml).buffer);
  expect(writtenMeasures(reopened.notation)).toEqual(expected);
  const attacks = (notes: typeof score.notes) => notes.map(n => [n.hand, n.pitch, n.beat, n.beats].join('/')).sort();
  expect(score.notes.every(n => n.beats > 0)).toBe(true);
  expect(attacks(reopened.notes)).toEqual(attacks(score.notes));
});

test('stops at a partially ruled system before accepting a closing pickup', () => {
  const page = engraving([1, 4, 3]);
  const broken = engraving([4]).operators.replace('10 120 m 110 120 l S', '');
  const withSystem = (offset: number) => ({ ...page,
    operators: page.operators + '\nq 1 0 0 1 0 ' + offset + ' cm\n' + broken + '\nQ' });
  const read = (offset: number) => readPianoDocumentPreview({ pageCount: 1, page: () => withSystem(offset) }, 'Gap');
  const late = read(-90);
  expect(late?.coverage).toBe('partial');
  expect(late?.stoppedAtPage).toBe(1);
  expect(late?.notation.bars.map(bar => bar.length)).toEqual([1, 4]);
  expect(read(90)).toBeNull();
});
