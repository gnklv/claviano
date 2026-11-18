// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Notation } from '../src/domain/notation/notation';
import { performNotation } from '../src/domain/notation/performance';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { readPdf, type PdfContent } from '../src/infrastructure/parsers/pdf/document';
import { readPianoDocumentPreview, readPianoPreview } from '../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../src/infrastructure/writers/pdfPreviewMusicXml';
import { bytes } from './musicXmlScore';

const pdf = 'samples/czardas.pdf';
const mxl = 'samples/czardas.mxl';

function legacyChords(lowerOffset = 0): PdfContent {
  const operators = ['1 w'];
  const stroke = (x1: number, y1: number, x2: number, y2: number): void => {
    operators.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const glyph = (code: string, x: number, y: number): void => {
    operators.push(`BT /Music 20 Tf 1 0 0 1 ${x} ${y} Tm <${code}> Tj ET`);
  };
  for (const bottom of [150, 100]) {
    glyph(bottom === 150 ? '01' : '02', 12, bottom + 5);
    glyph('03', 25, bottom + 15);
    glyph('04', 25, bottom + 5);
  }
  for (let bar = 0; bar < 4; bar++) {
    const left = 10 + bar * 110;
    for (const bottom of [150, 100]) {
      for (let line = 0; line < 5; line++) stroke(left, bottom + line * 5, left + 110, bottom + line * 5);

      const x = left + 44 + (bottom === 100 ? lowerOffset : 0);
      const low = bottom + (bar % 2 === 0 ? 0 : 2.5);
      const high = low + (bottom === 150 ? 10 : 17.5);
      if (bottom === 150) {
        glyph('05', x, low);
        glyph('05', x, high);
        stroke(x + 6.25, low, x + 6.25, high + 15);
        glyph('05', x + 34, low + 5);
        stroke(x + 40.25, low + 5, x + 40.25, low + 20);
      } else {
        glyph('06', x, low);
        glyph('06', x, high);
        stroke(x + 6.25, low, x + 6.25, high + 15);
      }
    }
    stroke(left + 110, 170, left + 110, 100);
  }
  return {
    operators: operators.join('\n'),
    fonts: new Map([['Music', {
      name: 'MScore', codeBytes: 1,
      unicode: new Map([[1, '\ue19e'], [2, '\ue19c'], [3, '2'], [4, '4'], [5, '\ue12d'], [6, '\ue12c']]),
    }]]),
    form: () => undefined,
  };
}

test('reads a mid-system Emmentaler key change before pitching the first chord', () => {
  const base = legacyChords();
  const music = base.fonts.get('Music')!;
  const marks = [170, 115].map(y => `BT /Music 20 Tf 1 0 0 1 125 ${y} Tm <07> Tj ET`);
  const page = { ...base, operators: [base.operators, ...marks].join('\n'),
    fonts: new Map([['Music', { ...music, unicode: new Map([...music.unicode, [7, '\ue10e']]) }]]) };
  const opening = readPianoPreview(page, 'Key change')!;
  const full = readPianoDocumentPreview({ pageCount: 1, page: () => page }, 'Key change')!.notation;
  for (const notation of [opening, full]) {
    expect(notation.keySignatures.map(k => [k.beat, k.fifths])).toEqual([[0, 0], [2, 1]]);
    expect(notation.notes.find(n => n.staff === 1 && n.bar === 1)?.sounding).toBe(66);
    expect(notation.notes.find(n => n.staff === 1 && n.bar === 3)?.sounding).toBe(66);
  }
});

test('groups Emmentaler heads on a shared stem into chords and reopens the preview', () => {
  const preview = readPianoPreview(legacyChords(), 'Chords');
  if (!preview) throw new Error('The Emmentaler chords could not be read');
  const reopened = new MusicXmlParser().parse(bytes(writePdfPreviewMusicXml(preview)), 'Chords');
  const pitches = [
    [64, 71, 67, 43, 55],
    [65, 72, 69, 45, 57],
  ];
  for (const { notes } of [preview, reopened.notation]) {
    expect(notes).toHaveLength(20);
    for (let bar = 0; bar < 4; bar++) {
      const beat = bar * 2;
      const [highFirst, highSecond, highLater, lowFirst, lowSecond] = pitches[bar % 2];
      expect(notes.filter((note) => note.bar === bar).map(({ staff, sounding, beat, beats, chord }) =>
        [staff, sounding, beat, beats, chord])).toEqual([
        [1, highFirst, beat, 1, false], [1, highSecond, beat, 1, true], [1, highLater, beat + 1, 1, false],
        [2, lowFirst, beat, 2, false], [2, lowSecond, beat, 2, true],
      ]);
    }
  }
});

test('reads the second Emmentaler page and validates its staff timing', () => {
  const first = legacyChords();
  const second = legacyChords();
  const doc = { pageCount: 2, page: (index: number) => index ? second : first };
  const result = readPianoDocumentPreview(doc, 'Two pages');
  expect(result?.coverage).toBe('full');
  expect(result?.notation.bars).toHaveLength(8);
  expect(result?.notation.notes).toHaveLength(40);
  expect(result?.notation.notes.at(-1)?.beat).toBe(14);
  expect(readPianoDocumentPreview({ ...doc, page: i => i ? legacyChords(34) : first }, 'Misaligned')?.notation.bars).toHaveLength(4);
  const partial = readPianoDocumentPreview({ ...doc, page: i => i ? { ...second, operators: '' } : first }, 'Empty page');
  expect(partial).toMatchObject({ coverage: 'partial', stoppedAtPage: 2 });
  expect(partial?.notation.bars).toHaveLength(4);
});

test('declines a lower half chord aligned with the second upper quarter', () => {
  expect(readPianoPreview(legacyChords(34), 'Misaligned staves')).toBeNull();
});

test('declines a legacy bar with an unsupported augmentation dot', () => {
  const fixture = legacyChords();
  const fonts = new Map(fixture.fonts);
  const music = fonts.get('Music')!;
  fonts.set('Music', { ...music, unicode: new Map(music.unicode).set(7, '\ue127') });
  const operators = fixture.operators + '\nBT /Music 20 Tf 1 0 0 1 62 152.5 Tm <07> Tj ET';
  expect(readPianoPreview({ ...fixture, fonts, operators }, 'Dotted chord')).toBeNull();
});

function openingNotes(notation: Notation, bars: number): string[] {
  return notation.notes.filter(({ bar }) => bar < bars)
    .map(({ bar, staff, beat, beats, pitch, chord, duration, accidental, stem, beams, tieStart, tieStop, tuplet }) =>
      JSON.stringify([bar, staff, beat.toFixed(8), beats.toFixed(8), pitch, chord, duration, accidental,
        stem, beams, tieStart, tieStop, tuplet]))
    .sort();
}

test.skipIf(!existsSync(pdf) || !existsSync(mxl))('reopens the Czardas PDF opening with the printed chords and tempo', () => {
  const preview = readPianoPreview(readPdf(readFileSync(pdf)).page(0), 'Czardas');
  if (!preview) throw new Error('The Czardas opening could not be read');
  const bars = preview.bars.length;
  expect(bars).toBe(4);

  const parser = new MusicXmlParser();
  const reference = parser.parse(Uint8Array.from(readFileSync(mxl)).buffer, 'Czardas');
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(preview)), 'Czardas');
  const expectedNotes = openingNotes(reference.notation, bars);
  expect(expectedNotes).toHaveLength(38);
  const end = reference.notation.bars[bars]?.start ?? Infinity;
  for (const notation of [preview, reopened.notation]) {
    expect(notation.bars).toEqual(reference.notation.bars.slice(0, bars));
    expect(openingNotes(notation, bars)).toEqual(expectedNotes);
    expect(notation.clefs).toEqual(reference.notation.clefs.filter(({ beat }) => beat < end));
    expect(notation.timeSignatures).toEqual(reference.notation.timeSignatures.filter(({ beat }) => beat < end));
    expect(notation.keySignatures).toEqual(reference.notation.keySignatures.filter(({ beat }) => beat < end));
    expect(performNotation(notation).notation.tempoMarks).toEqual(reference.notation.tempoMarks.filter(({ beat }) => beat < end));
  }
});

test.skipIf(!existsSync(pdf) || !existsSync(mxl))('reads and reopens all five Czardas pages', () => {
  const document = readPdf(readFileSync(pdf));
  const reading = readPianoDocumentPreview(document, 'Czardas');
  if (!reading) throw new Error('The complete Czardas could not be read');
  const parser = new MusicXmlParser();
  const reference = parser.parse(Uint8Array.from(readFileSync(mxl)).buffer, 'Czardas').notation;
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(reading.notation)), 'Czardas').notation;
  expect(document.pageCount).toBe(5);
  expect(reference.bars).toHaveLength(134);
  expect(reference.notes).toHaveLength(1794);
  expect(reference.graces).toHaveLength(25);
  for (const score of [reading.notation, reopened]) {
    expect(score.bars).toEqual(reference.bars);
    expect(score.rests).toEqual(reference.rests);
    expect(score.graces).toEqual(reference.graces);
    expect(score.clefs).toEqual(reference.clefs);
    expect(score.keySignatures).toEqual(reference.keySignatures);
    expect(score.timeSignatures).toEqual(reference.timeSignatures);
    expect(score.notes).toHaveLength(reference.notes.length);
    for (const [i, actual] of score.notes.entries()) {
      const expected = reference.notes[i];
      const { beat, beats, beams, slurs, ...fields } = actual;
      const { beat: refBeat, beats: refBeats, beams: refBeams, slurs: refSlurs, ...refFields } = expected;
      expect(fields).toEqual(refFields);
      expect(slurs.map(s => [s.type, s.number])).toEqual(refSlurs.map(s => [s.type, s.number]));
      if (actual.tuplet?.actual === 7) {
        // The original MXL truncates each septuplet note at its 480-tick resolution.
        expect(beats).toBeCloseTo(0.125 * 6 / 7, 10);
        expect(Math.abs(beat - refBeat)).toBeLessThan(0.006);
      } else {
        expect(beats).toBeCloseTo(refBeats, 10);
        expect(beat).toBeCloseTo(refBeat, 10);
      }
      if (actual.bar === 13 && Math.abs(beat - 46.375) < 0.001) {
        // The printed stub extends left of its stem. The XML specifies a forward hook.
        expect(beams).toEqual(['continue', 'continue', 'backward hook']);
        expect(refBeams).toEqual(['continue', 'continue', 'forward hook']);
      } else expect(beams).toEqual(refBeams);
    }
  }
});
