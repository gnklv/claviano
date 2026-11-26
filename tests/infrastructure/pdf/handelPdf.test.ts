// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LoadScore } from '../../../src/application/use-cases/LoadScore';
import type { Notation } from '../../../src/domain/notation/notation';
import { keySignatureAt } from '../../../src/domain/score';
import { MidiFileParser } from '../../../src/infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { PdfScoreParser } from '../../../src/infrastructure/parsers/PdfScoreParser';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';

const loader = new LoadScore([new PdfScoreParser(), new MidiFileParser(), new MusicXmlParser()]);
const base = 'tests/fixtures/pdf/lilypond/handel-entree';

function loadFixture(extension: string) {
  const file = base + extension;
  return loader.execute(file, Uint8Array.from(readFileSync(file)).buffer);
}

function writtenMeasures(notation: Notation) {
  const measures = notation.bars.map((): string[] => []);
  for (const note of notation.notes) {
    const { bar, staff, sounding, beat, beats, articulations } = note;
    measures[bar].push([staff, sounding, beat - notation.bars[bar].start, beats, ...articulations].join('/'));
  }
  return measures.map(notes => notes.sort().join(' '));
}

test('imports Handel’s complete Entrée and preserves it through MusicXML', () => {
  const pdf = loadFixture('.pdf');
  const xml = writePdfPreviewMusicXml(pdf.notation);
  const reopened = loader.execute('handel-entree.musicxml', new TextEncoder().encode(xml).buffer);
  const expectedMeasures = readFileSync(base + '.notes', 'utf8').trim().split('\n');

  const midi = loadFixture('.mid');
  expect(midi.notes).toHaveLength(402);
  // Mutopia’s MIDI plays both sections once and collapses three same-staff unisons.
  const linear = midi.notes.map(({ hand, beat, pitch, beats }) => ({ hand, beat, pitch, beats }));
  for (const [beat, pitch] of [[19.5, 74], [20.5, 72], [46.25, 70]]) {
    const unison = linear.find(note => note.hand === 'right' && note.beat === beat && note.pitch === pitch);
    expect(unison).toBeDefined();
    linear.push(unison!);
  }
  const first = linear.filter(note => note.beat < 28);
  const second = linear.filter(note => note.beat >= 28);
  const expectedPerformance = [
    ...first, ...first.map(note => ({ ...note, beat: note.beat + 28 })),
    ...second.map(note => ({ ...note, beat: note.beat + 28 })),
    ...second.map(note => ({ ...note, beat: note.beat + 76 })),
  ].map(({ hand, beat, pitch, beats }) => [hand, beat, pitch, beats].join('/')).sort();
  const firstBars = Array.from({ length: 8 }, (_, i) => i);
  const secondBars = Array.from({ length: 13 }, (_, i) => i + 8);

  for (const score of [pdf, reopened]) {
    expect(score.notation.words).toContainEqual({ beat: 0, below: false, tempo: true, text: 'Vivace' });
    expect(score.notation.pickup).toBe(true);
    expect(score.notation.bars.map(bar => bar.length)).toEqual([
      0.5, ...Array.from({ length: 6 }, () => 4), 3.5, 0.5, ...Array.from({ length: 11 }, () => 4), 3.5,
    ]);
    expect(score.barWritten).toEqual([...firstBars, ...firstBars, ...secondBars, ...secondBars]);
    expect(score.notation.timeSignatures).toEqual([{ beat: 0, numerator: 4, denominator: 4 }]);
    expect([1, 2].map(staff => keySignatureAt(score, 0, staff).fifths)).toEqual([-2, 0]);
    expect(score.notation.clefs).toEqual([
      { staff: 1, beat: 0, clef: 'treble' },
      { staff: 2, beat: 0, clef: 'bass' },
      { staff: 2, beat: 54.5, clef: 'treble' },
      { staff: 2, beat: 57, clef: 'bass' },
    ]);
    expect(score.notation.notes.filter(note => note.tieStart || note.tieStop)
      .map(note => [note.staff, note.sounding, note.beat, note.tieStart, note.tieStop]))
      .toEqual([[1, 79, 66.5, true, false], [1, 79, 67.5, false, true]]);
    expect(score.notes.map(({ hand, beat, pitch, beats }) => [hand, beat, pitch, beats].join('/')).sort())
      .toEqual(expectedPerformance);
    expect(writtenMeasures(score.notation)).toEqual(expectedMeasures);
  }
});
