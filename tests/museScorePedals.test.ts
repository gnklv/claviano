// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { readPianoDocumentPreview } from '../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../src/infrastructure/writers/pdfPreviewMusicXml';
import { bytes } from './musicXmlScore';

const sample = 'samples/golden-hour-jvke-updated-ver';

test.skipIf(!existsSync(sample + '.pdf') || !existsSync(sample + '.mxl'))(
  'preserves all Golden Hour sustain starts and releases through PDF reconstruction and MusicXML reopening',
  () => {
    const parser = new MusicXmlParser();
    const preview = readPianoDocumentPreview(readPdf(readFileSync(sample + '.pdf')), 'Golden Hour');
    if (!preview) throw new Error('The Golden Hour PDF could not be read');
    const reference = parser.parse(Uint8Array.from(readFileSync(sample + '.mxl')).buffer, 'Golden Hour');
    const reopened = parser.parse(bytes(writePdfPreviewMusicXml(preview.notation)), 'Golden Hour');
    expect(reference.notation.pedalMarks).toHaveLength(140);
    for (const notation of [preview.notation, reopened.notation]) {
      expect(notation.pedalMarks).toEqual(reference.notation.pedalMarks);
      expect(notation.pedalMoves).toEqual(reference.notation.pedalMoves);
    }
  },
);
