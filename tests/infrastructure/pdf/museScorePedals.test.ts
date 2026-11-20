// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { readPianoDocumentPreview } from '../../../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';
import { readMuseScorePedals } from '../../../src/infrastructure/parsers/pdf/museScorePedals';
import type { MuseScoreDirectionBar } from '../../../src/infrastructure/parsers/pdf/museScoreDirections';
import { attributes, bytes, note, score } from '../../support/musicXmlScore';

const samples = [
  { name: 'still-dre-variation-composition', count: 104, style: 'release hooks below independent bass and treble rhythms' },
  { name: 'cogwork-dancers-christopher-larkin', count: 198, style: 'pedal releases between notes and before a new press' },
  { name: 'golden-hour-jvke-updated-ver', count: 140, style: 'signed brackets' },
  { name: 'severance-original-series-piano-theme', count: 88, style: 'unsigned brackets' },
  { name: 'la-valse-damelie-yann-tiersen-la-valse-d-amelie', count: 2, style: 'pedal and release signs' },
];

for (const { name, count, style } of samples) {
  const sample = 'samples/' + name;
  test.skipIf(!existsSync(sample + '.pdf') || !existsSync(sample + '.mxl'))(
    `preserves ${style} in ${name} through PDF reconstruction and MusicXML reopening`,
    () => {
      const parser = new MusicXmlParser();
      const preview = readPianoDocumentPreview(readPdf(readFileSync(sample + '.pdf')), name);
      if (!preview) throw new Error(`The PDF for ${name} could not be read`);
      const reference = parser.parse(Uint8Array.from(readFileSync(sample + '.mxl')).buffer, name);
      const reopened = parser.parse(bytes(writePdfPreviewMusicXml(preview.notation)), name);
      expect(reference.notation.pedalMarks).toHaveLength(count);
      for (const notation of [preview.notation, reopened.notation]) {
        expect(notation.pedalMarks).toEqual(reference.notation.pedalMarks);
        expect(notation.pedalMoves).toEqual(reference.notation.pedalMoves);
      }
    },
  );
}

const measure = { left: 0, right: 30, staves: [{ bottom: 60, space: 1 }, { bottom: 30, space: 1 }] } as const;
const segment = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, width: 0.1 });

test.each([
  { beats: [0, 1, 2, 3], hook: 17.1, release: 1.5 },
  { beats: [0, 3], hook: 27.1, release: 4 },
])('reads an unsigned hook at $hook from its surrounding rhythmic spacing', ({ beats, hook, release }) => {
  const { notation } = new MusicXmlParser().parse(score('<measure>' + attributes() + note('C', 4, 8) + '</measure>'), '');
  const bar: MuseScoreDirectionBar = {
    index: 0, measure, notes: [], columns: beats.map(beat => ({ beat, x: 10 + beat * 5 })),
    geometry: { glyphs: [], fills: [], curvedFills: [], segments: [
      segment(10, 28, hook, 28), segment(10, 28, 10, 29.2), segment(hook, 28, hook, 29.2),
    ] },
  };
  expect(readMuseScorePedals(notation, [[bar]]).pedalMoves.map(move => move.beat)).toEqual([0, release]);
});

test('a sub-space signed bracket needs a release hook', () => {
  const { notation } = new MusicXmlParser().parse(score('<measure>' + attributes() + note('C', 4, 8) + '</measure>'), '');
  const rail = segment(13.65, 28, 14.3, 28);
  const bar: MuseScoreDirectionBar = {
    index: 0, measure, notes: [], columns: [{ beat: 0, x: 10 }, { beat: 1, x: 14.5 }],
    geometry: { glyphs: [{ text: String.fromCodePoint(0xe650), code: 0xe650, font: 'Bravura', size: 4, x: 10, y: 28 }],
      fills: [], curvedFills: [], segments: [rail] },
  };
  expect(readMuseScorePedals(notation, [[bar]]).pedalMoves).toHaveLength(0);
  bar.geometry.segments.push(segment(14.3, 28, 14.3, 29.2));
  expect(readMuseScorePedals(notation, [[bar]]).pedalMoves.map(move => move.beat)).toEqual([0, 1]);
});
