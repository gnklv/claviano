import { documentCoverage, type PdfPianoPreview, type PdfDocumentReading } from './pianoReading';
import { isLilyPondPage, lilyPondPagePrefix } from './lilyPondMeasures';
import { readLilyPondPiano } from './lilyPondPiano';
import { pianoCoverage } from './pianoCoverage';
import { ScoreLoadError } from '../../../application/ports/ScoreParser';
import { museScoreMeasures } from './museScoreMeasures';
import { museScoreKey } from './pianoKey';
import { identifyMusicEncoding, isLegacyMusicGlyph } from './musicGlyphs';
import { readMuseScorePiano } from './museScorePiano';
import { applyMuseScoreDirections } from './museScoreDirections';
import { readLegacyDocument, readLegacyPiano } from './legacyPiano';
import { readPickupPreview } from './pianoPickup';
import { readEvents, readVoice, type TimedNote } from './pianoNotes';
import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, WrittenNote } from '../../../domain/notation/written';
import type { PdfContent, readPdf } from './document';
import { extractPdfGeometry, type PdfGeometry, type PdfGlyph } from './geometry';
import {
  PREVIEW_BARS, TREBLE, BASS, PEDAL, PIANO,
  codePoint, within, sortedX, isHead, isAccidental, type Measure, type Staff, type BeamStrip, top, center,
  pianoMeasures, musicGlyphs, printedClef, keyOf, isTimeSymbol, timeOf, strips, startingTempo,
} from './pianoGeometry';

function staffNotes(
  geometry: PdfGeometry, glyphs: readonly PdfGlyph[], bar: WrittenBar, barIndex: number, staff: Staff,
  number: number, clef: Clef, fifths: number, beams: readonly BeamStrip[],
): TimedNote[] | null {
  // The preview subset has full voices of regular noteheads without rests or tuplets.
  if (glyphs.some((glyph) => (codePoint(glyph) >= 0xe4e0 && codePoint(glyph) <= 0xe4ef)
    || (codePoint(glyph) >= 0xe880 && codePoint(glyph) <= 0xe88a)
    || (codePoint(glyph) >= 0xe0a0 && codePoint(glyph) <= 0xe0ff && !isHead(glyph)))) return null;
  const events = readEvents(glyphs, staff, geometry.segments, beams);
  if (!events?.length) return null;
  const polyphonic = events.some((event) => event.headless);
  const voices = polyphonic
    ? [events.filter((event) => !event.stem?.up), events.filter((event) => event.stem?.up)]
    : [events];
  const output: TimedNote[] = [];
  for (const [i, voice] of voices.entries()) {
    const read = readVoice(voice, glyphs, bar, barIndex, staff, number, clef, fifths, String(i + 1));
    if (!read) return null;
    output.push(...read.notes);
  }
  return output;
}

/** Reads a supported opening fragment from a vector piano engraving. */
export function readPianoPreview(content: PdfContent, title: string): Notation | null {
  const geometry = identifyMusicEncoding(extractPdfGeometry(content));
  if (isLilyPondPage(geometry)) {
    return readLilyPondPiano([geometry], [lilyPondPagePrefix(geometry).bars.slice(0, PREVIEW_BARS)], title)?.notation ?? null;
  }
  const measures = pianoMeasures(geometry.segments).slice(0, PREVIEW_BARS);
  if (geometry.glyphs.some(isLegacyMusicGlyph)) return readLegacyPiano(geometry, measures, title);
  return readCompleteBars(geometry, measures, title) ?? readPickupPreview(geometry, title)?.notation ?? null;
}

export function readPianoDocumentPreview(doc: ReturnType<typeof readPdf>, title: string): PdfDocumentReading | null {
  if (!doc.pageCount) return null;
  const pages: PdfGeometry[] = [];
  for (let i = 0; i < doc.pageCount; i++) {
    try {
      pages.push(identifyMusicEncoding(extractPdfGeometry(doc.page(i))));
    } catch (error) {
      if (!(error instanceof ScoreLoadError)) throw error;
      if (error.code !== 'unsupported-feature') throw new ScoreLoadError(error.code, error.message, i + 1);
      if (!pages.length) return null;
      break;
    }
  }
  const first = pages[0]!;
  if (isLilyPondPage(first)) {
    const prefixes = pages.map(page => isLilyPondPage(page) ? lilyPondPagePrefix(page) : { bars: [], complete: false });
    const gap = prefixes.findIndex(prefix => !prefix.complete);
    const measures = prefixes.slice(0, gap < 0 ? prefixes.length : gap + 1).map(prefix => prefix.bars);
    const preview = readLilyPondPiano(pages, measures, title, gap < 0 && pages.length === doc.pageCount);
    return preview && documentCoverage(preview, measures, doc.pageCount, gap < 0 ? undefined : gap + 1);
  }
  const measures = pages.map(museScoreMeasures);
  let limit = 0;
  let gapPage: number | undefined;
  for (const [i, page] of pages.entries()) {
    const safe = pianoCoverage(page, measures[i]!);
    limit += safe ?? measures[i]!.length;
    if (safe !== null) {
      gapPage = i + 1;
      break;
    }
  }
  if (!limit) return null;
  const withCoverage = (preview: PdfPianoPreview) => documentCoverage(preview, measures, doc.pageCount, gapPage);

  const legacy = first.glyphs.some(isLegacyMusicGlyph);
  const leland = first.glyphs.some(g => g.font === 'Leland' || g.musicEncoding === 'smufl');
  if (legacy || leland) {
    const seed = measures[0]?.[0] && readHeader(first, measures[0][0], title);
    function read(limit?: number) {
      if (legacy) {
        const notation = readLegacyDocument(first, title, pages.slice(1), limit);
        return notation && { notation, issues: [] };
      }
      return seed ? readMuseScorePiano(pages, seed, applyMuseScoreDirections, limit,
        gapPage === undefined && pages.length === doc.pageCount) : null;
    }
    const complete = read(limit);
    if (complete) return withCoverage(complete);
    // Each reader accepts a prefix only after validating every bar in it.
    // Locate the last verified boundary without retaining state from a failed bar.
    let low = 0, high = limit - 1;
    let best: PdfPianoPreview | null = null;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = read(middle);
      if (candidate) { low = middle; best = candidate; }
      else high = middle - 1;
    }
    if (best) return withCoverage(best);
  }
  const pickup = !legacy && readPickupPreview(first, title, pages.slice(1), limit);
  if (pickup) return withCoverage(pickup);
  if (!legacy) {
    if (leland) return null;
    const sequence: { geometry: PdfGeometry; measure: Measure }[] = [];
    pages: for (const [index, geometry] of pages.entries()) {
      const closed = pianoMeasures(geometry.segments);
      const page = measures[index]!;
      if (!page.length) break;
      for (const measure of page) {
        if (sequence.length === limit) break pages;
        if (!closed.some(m => m.left === measure.left && m.right === measure.right
          && m.staves[0].bottom === measure.staves[0].bottom)) break pages;
        sequence.push({ geometry, measure });
      }
    }
    const notation = readCompleteBars(first, sequence.map(item => item.measure), title, sequence.map(item => item.geometry));
    return notation && withCoverage({ notation, issues: [] });
  }
  const closed = pianoMeasures(first.segments);
  const prefix: Measure[] = [];
  for (const measure of measures[0]!) {
    if (prefix.length === limit) break;
    if (!closed.some(m => m.left === measure.left && m.right === measure.right
      && m.staves[0].bottom === measure.staves[0].bottom)) break;
    prefix.push(measure);
  }
  for (let count = prefix.length; count > 0; count--) {
    const notation = readLegacyPiano(first, prefix.slice(0, count), title);
    if (notation) return withCoverage({ notation, issues: [] });
  }
  return null;
}

function readHeader(geometry: PdfGeometry, first: Measure, title: string): Notation | null {
  const initial = first.staves.map((staff) => musicGlyphs(geometry.glyphs, first, staff));
  const clefs = initial.map((glyphs) => {
    const glyph = glyphs.find(item => printedClef(codePoint(item)));
    return glyph && printedClef(codePoint(glyph));
  });
  const time = timeOf(initial[0]!, first.staves[0]);
  const lowerTime = timeOf(initial[1]!, first.staves[1]);
  if (!time || time.numerator !== lowerTime?.numerator || time.denominator !== lowerTime.denominator) return null;
  const keys = initial.map(row => keyOf(row, row.find(isTimeSymbol)!.x));
  if (clefs.some(c => !c) || keys[0] == null || keys[0] !== keys[1]) return null;
  return { title, bars: [], notes: [], rests: [], graces: [], dynamics: [], dynamicLevels: [], words: [],
    hairpins: [], pedalMoves: [], pedalMarks: [], octaveShifts: [], tempos: [], tempoMarks: [],
    keySignatures: [{ beat: 0, fifths: keys[0], minor: false }], timeSignatures: [time],
    clefs: clefs.flatMap((clef, i) => clef ? [{ ...clef, beat: 0, staff: i + 1 }] : []) };
}

function readCompleteBars(geometry: PdfGeometry, measures: readonly Measure[], title: string,
  pages?: readonly PdfGeometry[]): Notation | null {
  const first = measures[0];
  if (!first) return null;
  const header = readHeader(geometry, first, title);
  if (!header) return null;
  const clefs = header.clefs.map(c => c.clef);
  const time = header.timeSignatures[0]!;
  const key = header.keySignatures[0]!;
  const keySignatures = [key];
  const initial = first.staves.map(staff => musicGlyphs(geometry.glyphs, first, staff));
  const length = time.numerator * 4 / time.denominator;
  const bars: WrittenBar[] = [];
  const notes: WrittenNote[] = [];
  const pedalMoves: Notation['pedalMoves'][number][] = [];
  const pedalMarks: Notation['pedalMarks'][number][] = [];
  let beams = strips(geometry.fills, first.staves[0].space);
  measures: for (const [i, measure] of measures.entries()) {
    const page = pages?.[i] ?? geometry;
    const pageBreak = i > 0 && page !== (pages?.[i - 1] ?? geometry);
    if (pageBreak) beams = strips(page.fills, measure.staves[0].space);
    const bar = { start: i * length, length, navigation: {} };
    const previous = measures[i - 1];
    const newSystem = !previous || pageBreak || !within(top(previous.staves[0]), top(measure.staves[0]), 0.04);
    if (!newSystem && !within(previous.right, measure.left, 0.1)) break measures;
    const rows = measure.staves.map(staff => musicGlyphs(page.glyphs, measure, staff));
    const previousKey = keySignatures.at(-1)!.fifths;
    const signature = museScoreKey(rows, measure, clefs, previousKey);
    if (!signature) break measures;
    const aligned: TimedNote[][] = [];
    for (const [j, staff] of measure.staves.entries()) {
      const clef = clefs[j];
      const glyphs = rows[j]!.filter(g => !signature.marks[j]!.includes(g));
      const firstHead = glyphs.find(isHead);
      if (!clef || !firstHead) break measures;
      const printedClefs = page.glyphs.filter((glyph) =>
        [TREBLE, BASS].includes(codePoint(glyph)) && glyph.x > measure.left && glyph.x < measure.right
        && within(glyph.y, center(staff), staff.space * 3));
      if (newSystem ? printedClefs.length !== 1 : printedClefs.length !== 0) break measures;
      const printedClef = printedClefs[0];
      if (printedClef && (printedClef.x >= firstHead.x || codePoint(printedClef) !== (clef === 'treble' ? TREBLE : BASS))) break measures;
      const printedTime = timeOf(glyphs, staff);
      if (i > 0 && printedTime && (!pageBreak || printedTime.numerator !== time.numerator || printedTime.denominator !== time.denominator)) break measures;
      const musicalGlyphs = printedClef ? glyphs.filter((glyph) => glyph.x >= firstHead.x || (
        isAccidental(glyph) && firstHead.x - glyph.x < staff.space * 1.5
      )) : glyphs;
      const voice = staffNotes(page, musicalGlyphs, bar, i, staff, j + 1, clef, signature.fifths, beams);
      if (!voice) break measures;
      aligned.push(voice);
    }
    // The two staves and all voices must describe the same musical timeline.
    const onsets = sortedX(aligned.flat());
    for (let j = 1; j < onsets.length; j++) {
      const from = onsets[j - 1]!;
      const to = onsets[j]!;
      const sameColumn = within(from.x, to.x, measure.staves[0].space * 0.15);
      if (sameColumn ? from.note.beat !== to.note.beat : from.note.beat >= to.note.beat) break measures;
    }
    if (signature.fifths !== previousKey) keySignatures.push({ beat: bar.start, fifths: signature.fifths, minor: false });
    bars.push(bar);
    notes.push(...aligned.flat().map(({ note }) => note));
    const lower = measure.staves[1];
    const pedal = page.glyphs.find((glyph) => codePoint(glyph) === PEDAL && glyph.x > measure.left && glyph.x < measure.right
      && glyph.y < lower.bottom && glyph.y > lower.bottom - lower.space * 8);
    if (pedal && page.segments.some((line) =>
      within(line.y1, pedal.y, lower.space * 0.2) && within(line.y1, line.y2, 0.04)
      && line.x1 > pedal.x && within(line.x2, measure.right, lower.space * 1.2))) {
      pedalMoves.push({ bar: i, pedal: 'sustain', beat: bar.start, down: true },
        { bar: i, pedal: 'sustain', beat: bar.start + length, down: false });
      pedalMarks.push({ pedal: 'sustain', beat: bar.start, type: 'start', sign: true, line: true },
        { pedal: 'sustain', beat: bar.start + length, type: 'stop', sign: false, line: true });
    }
  }
  if (!bars.length || (!pages && bars.length !== measures.length)) return null;
  const tempo = startingTempo(geometry.glyphs, first);
  const dynamic = geometry.glyphs.find((glyph) => codePoint(glyph) === PIANO
    && within(glyph.x, initial[0]!.find(isHead)!.x, first.staves[0].space)
    && glyph.y < first.staves[0].bottom && glyph.y > top(first.staves[1]));
  const text = dynamic && sortedX(geometry.glyphs.filter((glyph) => /Italic$/.test(glyph.font)
    && glyph.x > dynamic.x && glyph.x < first.right
    && within(glyph.y, dynamic.y, first.staves[0].space * 0.12)
    && /^[\p{L} ,.'-]$/u.test(glyph.text))).map((glyph) => glyph.text).join('').trim();
  return {
    title, bars, notes, clefs: header.clefs,
    keySignatures, timeSignatures: [time], tempos: tempo ? [tempo.change] : [],
    tempoMarks: tempo ? [tempo.mark] : [], pedalMoves, pedalMarks, graces: [], rests: [],
    octaveShifts: [], dynamics: dynamic ? [{ beat: 0, below: false, text: 'p', letters: true }] : [],
    hairpins: [], dynamicLevels: [], words: text ? [{ beat: 0, text, tempo: false, below: true }] : [],
  };
}
