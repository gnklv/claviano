// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LoadScore } from '../../../src/application/use-cases/LoadScore';
import { performNotation } from '../../../src/domain/notation/performance';
import type { Score } from '../../../src/domain/score';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { PdfScoreParser } from '../../../src/infrastructure/parsers/PdfScoreParser';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';

const loader = new LoadScore([new PdfScoreParser(), new MusicXmlParser()]);

function loadFixture(piece: 'sunrise' | 'caravan' | 'rest', extension: string) {
  const file = 'tests/fixtures/pdf/borch/' + piece + '.' + extension;
  return loader.execute(file, Uint8Array.from(readFileSync(file)).buffer);
}

function writtenNotes(score: Score, withArticulations = true) {
  return score.notation.notes.map(n => [n.bar, n.staff, n.beat.toFixed(8), n.beats.toFixed(8), n.pitch.letter, n.pitch.octave,
    n.pitch.alteration, n.sounding, ...(withArticulations ? n.articulations : [])].join('/')).sort();
}

test('imports all of The Caravan with its voices, endings and repeated passage in the coda', () => {
  const pdf = loadFixture('caravan', 'pdf');
  const reference = loadFixture('caravan', 'mxl');
  const xml = writePdfPreviewMusicXml(pdf.notation);
  const reopened = loader.execute('caravan.musicxml', new TextEncoder().encode(xml).buffer);
  expect(reference.notation.notes).toHaveLength(792);
  for (const score of [pdf, reopened]) {
    expect(score.notation.bars).toHaveLength(38);
    expect(writtenNotes(score)).toEqual(writtenNotes(reference));
    expect(score.barWritten).toEqual(reference.barWritten);
    expect(score.barWritten).toHaveLength(69);
    expect(score.barWritten.slice(-11).map(i => i + 1)).toEqual([30, 31, 32, 31, 32, 33, 34, 35, 36, 37, 38]);
    expect(score.notation.words).toContainEqual({ text: 'Moderato', beat: 0, below: false, tempo: true });
    expect(score.notation.hairpins).toContainEqual({ start: 76, end: 78, type: 'diminuendo', below: false, drawn: true });
    expect(score.notes).toHaveLength(1375);
  }
});

test('opens Rest with its pickup, visible grace notes, and return from the segno to the coda', () => {
  const pdf = loadFixture('rest', 'pdf');
  const reference = loadFixture('rest', 'mxl');
  const reopened = loader.execute('rest.musicxml', new TextEncoder().encode(writePdfPreviewMusicXml(pdf.notation)).buffer);
  expect(pdf.notation.graces).toEqual(reference.notation.graces.filter(g => g.bar < 40));
  for (const score of [pdf, reopened]) {
    expect(score.notation.bars).toHaveLength(45);
    expect(score.notes).toHaveLength(665);
    expect(score.notation.notes).toHaveLength(531);
    expect(writtenNotes(score, false)).toEqual(writtenNotes(reference, false));
    expect(score.notation.graces.flatMap(g => g.notes)).toHaveLength(16);
    expect(score.barWritten).toHaveLength(61);
    expect(score.barWritten).toEqual(reference.barWritten);
    expect(score.notation.words).toContainEqual({ text: 'Allegretto quasi Andantino', beat: 70, below: false, tempo: true });
    expect(score.notation.hairpins).toContainEqual({ start: 22, end: 23, type: 'diminuendo', below: false, drawn: true });
  }
  const played = (score: Score) => score.notes.map(n => [n.hand, n.pitch, n.beat, n.beats].join('/')).sort();
  expect(played(reopened)).toEqual(played(pdf));
});

test('imports both pages of Sunrise and Incantations with their changing meters, voices and alternate endings', () => {
  const pdf = loadFixture('sunrise', 'pdf');
  const reference = loadFixture('sunrise', 'mxl');
  const reopened = loader.execute('sunrise.musicxml', new TextEncoder().encode(writePdfPreviewMusicXml(pdf.notation)).buffer);
  // The edition encodes six invisible grace notes as repeat-tie anchors in bar 50.
  const printed = performNotation({
    ...reference.notation, graces: reference.notation.graces.filter(g => g.bar !== 49),
  });
  const performance = (score: Score) => score.notes.map(n =>
    [n.hand, n.pitch, n.beat.toFixed(8), n.beats.toFixed(8)].join('/')).sort();
  const voices = (score: Score) => score.notation.notes.map(n =>
    [n.bar, n.staff, n.voice, n.beat.toFixed(8), n.sounding].join('/')).sort();
  const dynamicMarks = (score: Score) => score.notation.dynamics.map(d => [d.beat, d.below, d.text].join('/')).sort();
  for (const score of [pdf, reopened]) {
    expect(score.notation.bars).toHaveLength(54);
    expect(score.notation.notes).toHaveLength(856);
    expect(score.barWritten).toEqual(reference.barWritten);
    expect(score.notation.timeSignatures).toEqual(reference.notation.timeSignatures);
    expect(writtenNotes(score)).toEqual(writtenNotes(reference));
    expect(score.notes).toHaveLength(1021);
    expect(performance(score)).toEqual(performance(printed));
    expect(voices(score)).toEqual(voices(reference));
    expect(dynamicMarks(score)).toEqual(dynamicMarks(reference));
  }
});

test('keeps the two mordents printed below the treble staff through MusicXML export', () => {
  const pdf = loadFixture('sunrise', 'pdf');
  const xml = writePdfPreviewMusicXml(pdf.notation);
  const reopened = loader.execute('sunrise.musicxml', new TextEncoder().encode(xml).buffer);
  for (const score of [pdf, reopened]) {
    const marks = score.notation.notes.flatMap(n => n.ornaments.map(o => [n.beat, n.sounding, o.kind, o.below]));
    expect(marks).toEqual([[112, 68, 'inverted-mordent', true], [116, 68, 'inverted-mordent', true]]);
  }
});
