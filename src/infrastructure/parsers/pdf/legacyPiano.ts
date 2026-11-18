import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { close, isHead, alignedColumns, readStaff, type PlacedNote, type Onset } from './legacyStaff';
export { readLegacyDocument } from './legacyDocument';
import { applyPdfCurves } from './curves';
import { isLegacyMusicGlyph, musicGlyphCode as code } from './musicGlyphs';
import { museScoreKey } from './pianoKey';
import { keyOf, startingTempo, strips, timeOf, type Measure, type Staff } from './pianoGeometry';

// Accept only symbols whose meaning is preserved by this reader. In particular, a
// dotted note, grace, repeat, or change of clef must not silently become an ordinary attack.
function supportedSymbol(glyph: PdfGlyph): boolean {
  const symbol = code(glyph);
  return (
    isHead(glyph) ||
    symbol === 0xe4e5 ||
    symbol === 0xeaa9 ||
    symbol === 0xe4c0 ||
    symbol === 0xe4a0 ||
    symbol === 0xe4a1 ||
    (symbol >= 0xe260 && symbol <= 0xe264) ||
    (symbol >= 0xe240 && symbol <= 0xe245)
  );
}

export function readLegacyPiano(geometry: PdfGeometry, measures: Measure[], title: string): Notation | null {
  const first = measures[0];
  if (!first) return null;
  const signatureGlyphs = (staff: Staff) =>
    geometry.glyphs
      .filter(
        (g) =>
          isLegacyMusicGlyph(g) &&
          g.x > first.left &&
          g.x < first.right &&
          close(g.y, staff.bottom + staff.space * 2, staff.space * 3),
      )
      .map((g) => ({ ...g, text: String.fromCodePoint(code(g)) }));
  const initial = first.staves.map(signatureGlyphs);
  for (const row of initial) row.sort((a, b) => a.x - b.x);
  const times = initial.map((row, j) => timeOf(row, first.staves[j]!));
  const time = times[0];
  if (!time || time.numerator !== times[1]?.numerator || time.denominator !== times[1]?.denominator) return null;
  const keys = initial.map((row) =>
    keyOf(row, row.find((g) => g.text.codePointAt(0)! >= 0xe080 && g.text.codePointAt(0)! <= 0xe089)?.x ?? 0),
  );
  const fifths = keys[0];
  if (fifths == null || fifths !== keys[1]) return null;
  const clefs = initial.map((row) => row.find((g) => ['\ue050', '\ue062'].includes(g.text))?.text);
  if (clefs.some((c) => !c)) return null;
  const currentClefs = clefs.map(c => c === '\ue050' ? 'treble' as const : 'bass' as const);
  const keySignatures = [{ beat: 0, fifths, minor: false }];
  const notes: PlacedNote[] = [];
  const rests: WrittenRest[] = [];
  const bars: WrittenBar[] = [];
  const dynamics: Notation['dynamics'][number][] = [];
  const words: Notation['words'][number][] = [];
  const length = (time.numerator * 4) / time.denominator;
  const beams = strips(geometry.fills, first.staves[0].space);
  for (const [index, measure] of measures.entries()) {
    const [upper, lower] = measure.staves;
    const space = upper.space;
    const previous = measures[index - 1];
    if (
      previous &&
      (!close(previous.right, measure.left, space * 0.1) ||
        !close(previous.staves[0].bottom, upper.bottom, space * 0.1))
    )
      return null;
    const boundary = (upper.bottom + lower.bottom + 4 * space) / 2;
    const range = geometry.glyphs.filter(
      (g) =>
        g.x > measure.left &&
        g.x < measure.right &&
        g.y > lower.bottom - 6 * space &&
        g.y < upper.bottom + 9 * space,
    );
    const bar = { start: index * length, length, navigation: {} };
    const onsets: Onset[] = [];
    const staffRows = measure.staves.map((_, j) =>
      range.filter(g => isLegacyMusicGlyph(g) && (j === 0 ? g.y > boundary : g.y <= boundary)));
    const previousKey = keySignatures.at(-1)!.fifths;
    const signature = museScoreKey(staffRows, measure, currentClefs, previousKey);
    if (!signature) return null;
    if (signature.fifths !== previousKey) keySignatures.push({ beat: bar.start, fifths: signature.fifths, minor: false });
    for (const [j, staff] of measure.staves.entries()) {
      const glyphs = staffRows[j]!.filter(g => !signature.marks[j]!.includes(g));
      // The first bar begins with a clef, key signature and meter on each staff.
      const meterEnd =
        index === 0
          ? Math.max(...glyphs.filter((g) => code(g) >= 0xe080 && code(g) <= 0xe089).map((g) => g.x))
          : -Infinity;
      const content = glyphs.filter((g) => g.x > meterEnd);
      const header = glyphs.filter((g) => g.x <= meterEnd);
      if (
        header.some(
          (g) => ![0xe050, 0xe062, 0xe260, 0xe262].includes(code(g)) && !(code(g) >= 0xe080 && code(g) <= 0xe089),
        ) ||
        header.filter((g) => [0xe050, 0xe062].includes(code(g))).length !== (index === 0 ? 1 : 0) ||
        content.some((g) => !supportedSymbol(g) || !close(g.size, space * 4, space * 0.2))
      )
        return null;
      if (
        !readStaff(
          geometry,
          content,
          staff,
          currentClefs[j]!,
          signature.fifths,
          bar,
          index,
          j + 1,
          beams,
          notes,
          rests,
          onsets,
        )
      )
        return null;
    }
    if (!alignedColumns(onsets, space)) return null;
    const beatAt = (x: number) =>
      onsets.reduce((nearest, n) => (Math.abs(n.x - x) < Math.abs(nearest.x - x) ? n : nearest)).beat;
    for (const g of range.filter((g) => g.font === 'MScoreText')) {
      const text = code(g) === 0xe522 ? 'f' : code(g) === 0xe520 ? 'p' : null;
      if (!text) return null;
      dynamics.push({ text, beat: beatAt(g.x), below: g.y < lower.bottom, letters: true });
    }
    const labels = range.filter(
      (g) => !isLegacyMusicGlyph(g) && /^[a-z.]$/i.test(g.text) && g.y > upper.bottom + 4 * space,
    );
    const rows = new Map<number, PdfGlyph[]>();
    for (const glyph of labels) {
      const row = rows.get(glyph.y) ?? [];
      row.push(glyph);
      rows.set(glyph.y, row);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      words.push({ text: row.map((g) => g.text).join(''), beat: beatAt(row[0]!.x), below: false, tempo: false });
    }
    bars.push(bar);
  }
  const tempo = startingTempo(geometry.glyphs, first);
  return {
    title,
    bars,
    notes: applyPdfCurves(geometry, notes, first.staves[0].space),
    rests,
    clefs: clefs.map((c, j) => ({ staff: j + 1, beat: 0, clef: c === '\ue050' ? 'treble' : 'bass' })),
    timeSignatures: [time],
    keySignatures,
    tempos: tempo ? [tempo.change] : [],
    tempoMarks: tempo ? [tempo.mark] : [],
    graces: [],
    pedalMoves: [],
    pedalMarks: [],
    octaveShifts: [],
    dynamics,
    dynamicLevels: [],
    words,
    hairpins: [],
  };
}
