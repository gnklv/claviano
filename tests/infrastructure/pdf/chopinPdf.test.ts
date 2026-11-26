// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LoadScore } from '../../../src/application/use-cases/LoadScore';
import { midiOf } from '../../../src/domain/notation/spelling';
import { engrave } from '../../../src/domain/notation/engraving';
import type { Note } from '../../../src/domain/note';
import { MidiFileParser } from '../../../src/infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { PdfScoreParser } from '../../../src/infrastructure/parsers/PdfScoreParser';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';

const loader = new LoadScore([new PdfScoreParser(), new MidiFileParser(), new MusicXmlParser()]);
const base = 'tests/fixtures/pdf/lilypond/chopin-op64-no1';

function loadFixture(extension: string) {
  const file = base + extension;
  return loader.execute(file, Uint8Array.from(readFileSync(file)).buffer);
}

function ending(notes: readonly Note[]) {
  // The 8va begins on the eighth note immediately before the long tuplet.
  return notes.filter(n => n.beat >= 407.5)
    .map(n => [n.beat, n.pitch, n.beats])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

test('imports the entire Minute Waltz and preserves its closing passage through MusicXML', () => {
  const pdf = loadFixture('.pdf');
  const midi = loadFixture('.mid');
  const xml = writePdfPreviewMusicXml(pdf.notation);
  const reopened = loader.execute('waltz.musicxml', new TextEncoder().encode(xml).buffer);
  expect(pdf.notation.bars).toHaveLength(125);
  expect(pdf.notes).toHaveLength(midi.notes.length);
  const expected = ending(midi.notes);
  expect(expected).toHaveLength(39);
  expect(ending(pdf.notes)).toEqual(expected);
  expect(ending(reopened.notes)).toEqual(expected);
  const octave = { staff: 1, start: 362.5, end: 366, octaves: 1 };
  for (const score of [pdf, reopened]) {
    expect(score.notation.octaveShifts).toEqual([octave]);
    const shifted = score.notation.notes.filter(n => n.staff === 1 && n.beat >= octave.start && n.beat < octave.end);
    expect(shifted).toHaveLength(9);
    expect(shifted.every(n => n.sounding === midiOf(n.pitch) + 12)).toBe(true);
    const after = score.notation.notes.find(n => n.staff === 1 && n.beat === octave.end)!;
    expect(after.sounding).toBe(midiOf(after.pitch));
  }
  const passage = pdf.notation.notes.filter(n => n.staff === 1 && n.bar >= 121 && n.bar <= 123);
  expect(passage).toHaveLength(24);
  expect(passage.every(n => n.duration.value === 'eighth' && n.beats === 0.375)).toBe(true);
  expect(passage.filter(n => n.tupletStart)).toEqual([passage[0]]);
  expect(passage.filter(n => n.tupletStop)).toEqual([passage.at(-1)]);
  expect(passage[0]?.tuplet?.actual).toBe(24);
  const printedGroup = engrave(reopened).tuplets.find(t => t.number === 24);
  expect(printedGroup?.chords).toHaveLength(24);
});
