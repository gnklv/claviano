// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ScoreLoadError } from '../../../src/application/ports/ScoreParser';
import { performNotation } from '../../../src/domain/notation/performance';
import type { WrittenNote } from '../../../src/domain/notation/written';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';
import { readPdf, type PdfContent } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { readMuseScorePiano } from '../../../src/infrastructure/parsers/pdf/museScorePiano';
import { readPianoDocumentPreview, readPianoPreview } from '../../../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';
import { bytes } from '../../support/musicXmlScore';

const symbols = new Map([
  [1, '\ue050'], // treble
  [2, '\ue062'], // bass
  [3, '\ue084'], // 4
  [4, '\ue0a4'], // filled head
  [5, '\ue261'], // natural
  [6, '\ue262'], // sharp
  [7, '\ueca5'], // metronome quarter
  [8, '\uecb7'], // metronome dot
  [9, '='],
  [10, '8'],
  [11, '0'],
  [12, '\ue650'], // sustain pedal
  [13, '\ue520'], // piano dynamic
  [14, '\ue4e3'], // whole-measure rest
]);

function engraving(missingStem = false, barCount = 5, musicFont = 'Example music font', damagedBar = 0): PdfContent {
  const ops = ['1 w'];
  const stroke = (x1: number, y1: number, x2: number, y2: number): void => {
    ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const glyph = (code: number, x: number, y: number): void => {
    ops.push(`BT /Music 20 Tf 1 0 0 1 ${x} ${y} Tm <${code.toString(16).padStart(2, '0')}> Tj ET`);
  };
  glyph(7, 38, 185);
  glyph(8, 44, 185);
  glyph(9, 49, 185);
  glyph(10, 54, 185);
  glyph(11, 59, 185);
  glyph(13, 40, 135);
  for (const [i, letter] of [...'dolce'].entries()) {
    ops.push(`BT /Text 10 Tf 1 0 0 1 ${48 + i * 5} 135 Tm (${letter}) Tj ET`);
  }
  for (const y of [150, 100]) {
    glyph(y === 150 ? 1 : 2, 12, y + 5);
    glyph(6, 21, y + (y === 150 ? 20 : 15));
    glyph(3, 29, y + 15);
    glyph(3, 29, y + 5);
  }
  for (let bar = 0; bar < barCount; bar++) {
    const left = 10 + 110 * bar;
    const right = left + 110;
    for (const bottom of [150, 100]) {
      for (let line = 0; line < 5; line++) {
        stroke(left, bottom + line * 5, right, bottom + line * 5);
      }
      for (let beat = 0; beat < 4; beat++) {
        const x = left + 30 + beat * 18;
        const y = bottom + (bottom === 150 ? 2.5 : 15);
        if (bar === 1 && beat === 1) glyph(5, x - 5, y);
        glyph(4, x, y);
        if (!missingStem || bar !== damagedBar || beat !== 0) stroke(x + 6.25, y, x + 6.25, y + 15);
      }
    }
    stroke(right, 170, right, 120);
    stroke(right, 120, right, 100);
    if (bar < 2) {
      glyph(12, left + 30, 85);
      stroke(left + 41, 85, right, 85);
    }
  }
  return {
    operators: ops.join('\n'),
    fonts: new Map([
      ['Music', { name: musicFont, unicode: symbols, codeBytes: 1 }],
      ['Text', { name: 'Example-Italic', unicode: new Map(), codeBytes: 1 }],
    ]),
    form: () => undefined,
  };
}

test('derives pitches, signatures and durations from four bars of piano vector marks', () => {
  const notation = readPianoPreview(engraving(), 'Vector exercise')!;
  expect(notation.bars.map(({ start, length }) => [start, length])).toEqual([[0, 4], [4, 4], [8, 4], [12, 4]]);
  expect(notation.timeSignatures).toEqual([{ beat: 0, numerator: 4, denominator: 4 }]);
  expect(notation.keySignatures).toEqual([{ beat: 0, fifths: 1, minor: false }]);
  expect(notation.notes).toHaveLength(32);
  expect(notation.notes.filter((note) => note.bar === 1).map(({ sounding, accidental, beats }) => [sounding, accidental, beats]))
    .toEqual([
      [66, null, 1], [65, 'natural', 1], [65, null, 1], [65, null, 1],
      [54, null, 1], [53, 'natural', 1], [53, null, 1], [53, null, 1],
    ]);
  expect(performNotation(notation).endBeat).toBe(16);
});

test('declines a bar whose stem geometry cannot be read', () => {
  expect(readPianoPreview(engraving(true), 'Incomplete')).toBeNull();
});

test('reads consecutive pages and rejects incomplete staff timelines in the full-document reader', () => {
  const page = engraving();
  const opening = readPianoPreview(page, 'Exercise')!;
  const geometry = extractPdfGeometry(page);
  const complete = readMuseScorePiano([geometry, geometry], opening)!.notation;
  expect(complete.bars).toHaveLength(10);
  expect(complete.notes).toHaveLength(80);
  expect(complete.notes.at(-1)?.beat).toBe(39);
  expect(readMuseScorePiano([geometry, extractPdfGeometry(engraving(true))], opening)).toBeNull();
  expect(readMuseScorePiano([geometry, { ...geometry, segments: [] }], opening)).toBeNull();
  const wrongSystemNumber = { x: 10, y: 181, size: 8, font: 'Example', text: '9', code: 57 };
  const wrongPage = { ...geometry, glyphs: [...geometry.glyphs, wrongSystemNumber] };
  expect(readMuseScorePiano([geometry, wrongPage], opening)).toBeNull();
});

test('takes a pickup measure rest from the sounding staff and follows consistent printed numbering', () => {
  const page = engraving(false, 1, 'Leland');
  const opening = readPianoPreview(engraving(), 'Pickup')!;
  const full = extractPdfGeometry(page);
  const pickup = {
    ...full,
    glyphs: [
      ...full.glyphs.filter(g => g.text !== '\ue0a4' || g.x === 40 && g.y > 150),
      { x: 80, y: 115, font: 'Leland', size: 20, code: 14, text: '\ue4e3' },
    ],
    segments: full.segments.filter(s => s.x1 !== s.x2 || s.x1 === 120 || s.x1 === 46.25 && s.y1 > 150),
  };
  const numbered = (number: number) => ({
    ...full,
    glyphs: [...full.glyphs, { x: 10, y: 181, size: 8, font: 'Edwin-Italic', text: String(number), code: number }],
  });
  for (const [second, third] of [[1, 2], [2, 3]] as const) {
    const result = readMuseScorePiano([pickup, numbered(second), numbered(third)], opening)?.notation;
    expect(result?.bars.map(({ start, length }) => [start, length])).toEqual([[0, 1], [1, 4], [5, 4]]);
    expect(result?.rests).toMatchObject([{
      staff: 2, beat: 0, measure: true, duration: { value: 'quarter', dots: 0 },
    }]);
  }
  expect(readMuseScorePiano([pickup, numbered(1), numbered(3)], opening)).toBeNull();
});

test('requires the true last page for a short bar that complements a MuseScore pickup', () => {
  const full = engraving(false, 2, 'Leland');
  const page = { ...full, operators: full.operators.split('\n').filter(line => {
    // Leave one quarter in the first bar and three in the second on both staves.
    return ![58, 76, 94, 204].some(x => line.includes(` ${x} `) && line.includes('<04>'));
  }).join('\n') };
  const complete = readPianoDocumentPreview({ pageCount: 1, page: () => page }, 'Complete');
  expect(complete?.notation.bars.map(b => b.length)).toEqual([1, 3]);
  const partial = readPianoDocumentPreview({ pageCount: 2, page: i => {
    if (!i) return page;
    throw new ScoreLoadError('unsupported-feature', 'Unreadable page');
  } }, 'Partial');
  expect(partial?.coverage).toBe('partial');
  expect(partial?.notation.bars.map(b => b.length)).toEqual([1]);
});

test('applies a cancelled key from the start of the measure and carries the new key forward', () => {
  const page = engraving();
  const opening = readPianoPreview(page, 'Change of key')!;
  const geometry = extractPdfGeometry(page);
  const printed = (y: number) => ({ x: 236, y, font: 'Example music font', size: 20, code: 5, text: '\ue261' });
  geometry.glyphs.push(printed(170), printed(115));
  const result = readMuseScorePiano([geometry], opening)!.notation;
  expect(result.keySignatures.map(({ beat, fifths }) => [beat, fifths])).toEqual([[0, 1], [8, 0]]);
  const upper = result.notes.filter(note => note.staff === 1);
  expect(upper.find(note => note.beat === 0)?.sounding).toBe(66);
  expect(upper.filter(note => note.beat >= 8).map(note => [note.sounding, note.accidental]))
    .toEqual(Array(12).fill([65, null]));
  geometry.glyphs.pop();
  expect(readMuseScorePiano([geometry], opening)).toBeNull();
});

test.each(['Leland', 'Example music font'])('reports document coverage independently of a four-bar opening in %s', font => {
  const page = engraving(false, 2, font);
  const doc = { pageCount: 2, page: () => page };
  const full = readPianoDocumentPreview(doc, 'Short systems');
  expect(full?.coverage).toBe('full');
  expect(full?.notation.bars).toHaveLength(4);
  const partial = readPianoDocumentPreview({ ...doc, page: i => i ? engraving(true, 2, font, 1) : page }, 'Damaged ending');
  expect(partial).toMatchObject({ coverage: 'partial', stoppedAtPage: 2 });
  expect(partial?.notation.bars).toHaveLength(3);
  expect(readPianoDocumentPreview({ pageCount: 1, page: () => engraving(true, 2, font) }, 'Unreadable')).toBeNull();
});

test('keeps preceding bars when a later page contains an unsupported drawing', () => {
  const page = engraving(false, 1);
  const reading = readPianoDocumentPreview({ pageCount: 2,
    page: i => i ? { ...page, operators: 'BI' } : page }, 'Inline image');
  expect(reading).toMatchObject({ coverage: 'partial', stoppedAtPage: 2 });
  expect(reading?.notation.bars).toHaveLength(1);
});

test('routes a Leland score whose first bar contains a full-measure rest', () => {
  const page = engraving(false, 1, 'Leland');
  // Replace the four lower-staff attacks with a centered rest.
  const operators = page.operators.split('\n').filter(line =>
    !/ 115 Tm <04>/.test(line) && !/ 115 m [0-9.]+ 130 l S$/.test(line));
  operators.push('BT /Music 20 Tf 1 0 0 1 65 115 Tm <0e> Tj ET');
  const doc = { pageCount: 1, page: () => ({ ...page, operators: operators.join('\n') }) };
  const result = readPianoDocumentPreview(doc, 'Opening rest');
  expect(result?.coverage).toBe('full');
  expect(result?.notation.notes).toHaveLength(4);
  expect(result?.notation.rests).toMatchObject([{ staff: 2, measure: true }]);
});

test.each(['Leland', 'Example music font'])('stops at an unpaired staff with noteheads in %s', font => {
  const page = engraving(false, 3, font);
  // Remove the lower staff rulings of the middle bar while leaving its notes.
  const operators = page.operators.split('\n').filter(line =>
    !/^120 (100|105|110|115|120) m 230 \1 l S$/.test(line)).join('\n');
  const result = readPianoDocumentPreview({ pageCount: 1, page: () => ({ ...page, operators }) }, 'Unpaired staff');
  expect(result).toMatchObject({ coverage: 'partial', stoppedAtPage: 1 });
  expect(result?.notation.bars).toHaveLength(1);
});

function expectMusicXmlRoundTrip(preview: NonNullable<ReturnType<typeof readPianoPreview>>): void {
  const reopened = new MusicXmlParser().parse(bytes(writePdfPreviewMusicXml(preview)), 'File name');
  const scored = performNotation(preview);
  const notes = (written: readonly WrittenNote[]) => written.map((note) => ({ ...note, headless: !!note.headless }));

  expect(reopened.title).toBe(preview.title);
  expect(reopened.notation.bars).toEqual(preview.bars);
  expect(notes(reopened.notation.notes)).toEqual(notes(preview.notes));
  expect(reopened.notation.clefs).toEqual(preview.clefs);
  expect(reopened.notation.timeSignatures).toEqual(preview.timeSignatures);
  expect(reopened.notation.keySignatures).toEqual(preview.keySignatures);
  expect(reopened.notation.tempos).toEqual(preview.tempos);
  expect(reopened.notation.tempoMarks).toEqual(scored.notation.tempoMarks);
  expect(reopened.notation.pedalMoves).toEqual(preview.pedalMoves);
  expect(reopened.notation.pedalMarks).toEqual(preview.pedalMarks);
  expect(reopened.notation.dynamics).toEqual(preview.dynamics);
  expect(reopened.notation.words).toEqual(preview.words);
  expect(reopened.notes).toEqual(scored.notes);
  expect(reopened.pedal).toEqual(scored.pedal);
  expect(reopened.endBeat).toBe(scored.endBeat);
}

test('round-trips a synthetic two-staff PDF preview with tempo, dynamics and pedal changes', () => {
  const preview = readPianoPreview(engraving(), 'Vector exercise <F♯> & piano')!;
  expect(preview.tempoMarks).toEqual([
    { beat: 0, unit: { value: 'quarter', dots: 1 }, perMinute: 80, printed: true },
  ]);
  expect(preview.pedalMoves.map(({ beat, down }) => [beat, down])).toEqual([
    [0, true], [4, false], [4, true], [8, false],
  ]);
  expect(preview.dynamics).toEqual([{ beat: 0, below: false, text: 'p', letters: true }]);
  expect(preview.words).toEqual([{ beat: 0, below: true, tempo: false, text: 'dolce' }]);
  expectMusicXmlRoundTrip(preview);
});

const pdf = 'samples/golden-hour-jvke-updated-ver.pdf';
const mxl = 'samples/golden-hour-jvke-updated-ver.mxl';

const frolic = 'samples/directed-by-robert-b-weide-from-curb-your-enthusiasm-frolic-by-luciano-michelini.pdf';
test.skipIf(!existsSync(frolic))('reads the three-beat pickup and its one-beat closing bar', () => {
  const result = readPianoDocumentPreview(readPdf(readFileSync(frolic)), 'Frolic');
  expect(result?.coverage).toBe('full');
  const bars = result!.notation.bars;
  expect(bars).toHaveLength(17);
  expect(bars[0]?.length).toBe(3);
  expect(bars[1]?.start).toBe(3);
  expect(bars.at(-1)?.length).toBe(1);
});

const entertainer = 'samples/the-entertainer-scott-joplin-1902.pdf';
test.skipIf(!existsSync(entertainer))('reads a blank lower staff and retains voice identity across staves', () => {
  const result = readPianoDocumentPreview(readPdf(readFileSync(entertainer)), 'The Entertainer');
  const notes = result?.notation.notes ?? [];
  expect(notes.filter(note => note.bar === 0 && note.staff === 1)).toHaveLength(14);
  expect(notes.some(note => note.bar === 0 && note.staff === 2)).toBe(false);
  expect(notes).toContainEqual(expect.objectContaining({
    bar: 2, staff: 2, beat: 4.75, sounding: 57, voice: '1', beams: ['end', 'end'],
  }));
  const pairedRests = result?.notation.rests.filter(rest => rest.beat === 6.5);
  expect(pairedRests?.map(rest => [rest.staff, rest.voice])).toEqual([[1, '1'], [2, '5']]);
  expect(pairedRests?.map(rest => rest.displayPitch)).toEqual([{ letter: 3, octave: 5 }, { letter: 4, octave: 2 }]);
  expect(result?.notation.rests).toContainEqual(expect.objectContaining({
    staff: 1, voice: '2', beat: 114, displayPitch: { letter: 4, octave: 4 },
  }));
  const coincidentHeads = notes.filter(note => note.bar === 61 && note.staff === 2 && note.beat === 123 && note.sounding === 55);
  expect(coincidentHeads.map(note => [note.beats, note.stem, note.chord])).toEqual([[0.5, 'down', false], [1, 'up', false]]);
});

test.skipIf(!existsSync(pdf) || !existsSync(mxl))('matches the local Golden Hour edition for the first four bars', () => {
  const page = readPdf(readFileSync(pdf)).page(0);
  const preview = readPianoPreview(page, 'Golden Hour')!;
  const reference = new MusicXmlParser().parse(Uint8Array.from(readFileSync(mxl)).buffer, 'Golden Hour');
  const noteData = ({ bar, staff, pitch, beat, beats, duration, beams, accidental, stem, headless }: WrittenNote) =>
    JSON.stringify([bar, staff, pitch, beat, beats, duration, beams, accidental, stem, !!headless]);
  expect(preview.notes.map(noteData).sort()).toEqual(reference.notation.notes.filter((note) => note.bar < 4).map(noteData).sort());
  expect(preview.clefs).toEqual(reference.notation.clefs.filter(({ beat }) => beat === 0));
  expect(preview.timeSignatures).toEqual(reference.notation.timeSignatures.filter(({ beat }) => beat === 0));
  expect(preview.keySignatures).toEqual(reference.notation.keySignatures.filter(({ beat }) => beat === 0));
  expect(preview.tempoMarks).toEqual(reference.notation.tempoMarks.filter(({ beat }) => beat === 0).map((mark) => ({ ...mark, printed: true })));
  const scored = performNotation(preview);
  expect(scored.notes).toEqual(reference.notes.filter((note) => note.beat < 12));
  expect(scored.pedal).toEqual(reference.pedal.slice(0, 4));
  expectMusicXmlRoundTrip(preview);
});

test.skipIf(!existsSync(pdf) || !existsSync(mxl))('reads noteheads, voices and playing instructions throughout Golden Hour', () => {
  const actual = readPianoDocumentPreview(readPdf(readFileSync(pdf)), 'Golden Hour')!.notation;
  const reference = new MusicXmlParser().parse(Uint8Array.from(readFileSync(mxl)).buffer, 'Golden Hour').notation;
  const symbols = (notes: readonly WrittenNote[]) => notes.map(n => JSON.stringify([
    n.bar, n.staff, n.voice, n.beat, n.beats, n.pitch, n.sounding, n.duration, n.tieStart, n.tieStop,
    n.chord, n.clef, n.stem, n.beams, n.accidental, !!n.headless, n.articulations, n.arpeggio,
    n.fingering, n.parenthesized, n.fermata, n.tremolo, n.tuplet,
  ])).sort();
  expect(actual.bars).toHaveLength(reference.bars.length);
  expect(symbols(actual.notes)).toEqual(symbols(reference.notes));
  expect(actual.rests).toEqual(reference.rests);
  expect(actual.clefs).toEqual(reference.clefs);
});

test.each([['\ue08a', 4], ['\ue08b', 2]] as const)('reads common-time symbols in a SMuFL-encoded MScore subset (%s)', (meter, unit) => {
  const page = engraving(false, 3, 'MScore');
  const operators = page.operators.replace(/BT \/Music 20 Tf 1 0 0 1 29 (?:155|105) Tm <03> Tj ET/g, '');
  const music = page.fonts.get('Music')!;
  const fonts = new Map(page.fonts);
  fonts.set('Music', { ...music, unicode: new Map(music.unicode).set(3, meter) });
  const result = readPianoDocumentPreview({ pageCount: 1, page: () => ({ ...page, operators, fonts }) }, 'Study');
  expect(result?.coverage).toBe('full');
  expect(result?.notation.timeSignatures).toEqual([{ beat: 0, numerator: unit, denominator: unit }]);
  expect(result?.notation.notes).toHaveLength(24);
});
