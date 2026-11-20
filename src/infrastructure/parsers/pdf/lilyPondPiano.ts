import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, ClefChange, WrittenRest } from '../../../domain/notation/written';
import type { KeySignature, TimeSignature } from '../../../domain/score';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { applyLilyPondTies } from './lilyPondTies';
import { readPianoNoteMarks } from './pianoNoteMarks';
import { signatureFifths } from './pianoKey';
import { lilyPondAttacks } from './lilyPondAttacks';
import { timeLilyPondStaves } from './lilyPondTiming';
import { readAttackStaff } from './pianoAttackStaff';
import { center, codePoint, isAccidental, isHead, isTimeSymbol, printedClef,
  sortedX, strips, timeOf, within, type Staff } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';
import type { PdfPianoPreview } from './pianoReading';

/** LilyPond paints both long edges of each stem as a narrow filled rectangle. */
function stemSegments(geometry: PdfGeometry, space: number): PdfSegment[] {
  return geometry.fills.flatMap(points => {
    if (points.length !== 4) return [];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), width = right - left;
    const y1 = Math.min(...ys), y2 = Math.max(...ys);
    if (width <= 0 || width > space * 0.2 || y2 - y1 < space * 1.25
      || points.some(p => p.x !== left && p.x !== right || p.y !== y1 && p.y !== y2)) return [];
    const x = (left + right) / 2;
    return [{ x1: x, x2: x, y1, y2, width }];
  });
}

// Emmentaler's numerals also print fingerings. A meter precedes the first
// attack and lies on the staff, whereas fingerings follow their note columns.
function meterGlyphs(row: PdfGlyph[], staff: Staff): PdfGlyph[] {
  const first = row.find(g => isHead(g) || codePoint(g) >= 0xe4e2 && codePoint(g) <= 0xe4ef);
  return row.filter(g => isTimeSymbol(g) && (!first || g.x < first.x - staff.space * 0.5)
    && within(g.y, center(staff), staff.space * 2.3));
}

function printedMeter(row: PdfGlyph[], staff: Staff) {
  const digits = meterGlyphs(row, staff);
  if (digits.some(g => codePoint(g) >= 0xe08a)) return timeOf(digits, staff);
  // Feta numerals use the bottom of the glyph as their text baseline.
  if (!digits.length) return null;
  const mid = (Math.max(...digits.map(g => g.y)) + Math.min(...digits.map(g => g.y))) / 2;
  return timeOf(digits, { ...staff, bottom: mid - 2 * staff.space });
}

// Clef changes use a smaller glyph with the same origin and pitch mapping.
const smallClefs = new Map([[0xe07a, '\ue050'], [0xe07c, '\ue062']]);
const equivalentRests = new Map([[0xe4f4, '\ue4e3'], [0xe4f5, '\ue4e4'],
  [0xe4f2, '\ue4e5'], [0xe4f6, '\ue4e5']]);

function unsupportedRhythmicGlyph(glyph: PdfGlyph): boolean {
  const code = codePoint(glyph);
  return code === 0xe05c || code === 0xe07b || code === 0xe0a0
    || code >= 0xe246 && code <= 0xe24f || code >= 0xe4e0 && code < 0xe4e3
    || code >= 0xe4e9 && code <= 0xe4ed || code === 0xe4f3;
}

function normalizeStaffSigns(row: PdfGlyph[], staff: Staff): PdfGlyph[] {
  return row.map(glyph => {
    const code = codePoint(glyph);
    const equivalent = smallClefs.get(code) ?? equivalentRests.get(code);
    if (equivalent) return { ...glyph, text: equivalent };
    if (code !== 0xe050) return glyph;
    const number = row.find(g => g.text === '8' && !/Emmentaler|Feta/i.test(g.font)
      && g.x >= glyph.x && g.x < glyph.x + staff.space * 2
      && within(g.y, staff.bottom - 2.5 * staff.space, staff.space));
    return number ? { ...glyph, text: '\ue052' } : glyph;
  });
}

/** Accidentals before displaced seconds are stacked in front of the leftmost
 * head. Walk the stack before deciding which preceding signs belong to a key. */
function signatureMarks(row: PdfGlyph[], first: PdfGlyph, meter: PdfGlyph[], clef: PdfGlyph | undefined, space: number) {
  const marks = row.filter(g => isAccidental(g) && g.x < (meter[0]?.x ?? first.x) && (!clef || g.x > clef.x));
  if (meter.length) return marks;
  const column = row.filter(g => isHead(g) && within(g.x, first.x, 1.4 * space));
  let right = first.x;
  while (marks.length) {
    const mark = marks.at(-1)!;
    if (right - mark.x > (right === first.x ? 2.2 : 1.65) * space
      || !column.some(head => within(mark.y, head.y, space * .12) && head.x - mark.x < 4.25 * space)) break;
    marks.pop();
    right = mark.x;
  }
  return marks;
}

function placeAccidentals(row: PdfGlyph[], space: number) {
  const heads = row.filter(isHead);
  return row.map(g => {
    if (!isAccidental(g)) return g;
    const target = heads.find(h => h.x > g.x && h.x - g.x < space * 4.25 && within(h.y, g.y, space * .1));
    return target ? { ...g, x: target.x - space * .65 } : g;
  });
}

function rowForStaff(glyphs: PdfGlyph[], staff: Staff, candidates: Staff[]) {
  return sortedX(glyphs.filter(g => Math.abs(g.y - center(staff)) < staff.space * 10
    && candidates.every(other => other === staff
      || Math.abs(g.y - center(other)) >= Math.abs(g.y - center(staff)))));
}

export function readLilyPondPiano(pages: readonly PdfGeometry[], measures: readonly (readonly LilyPondMeasure[])[],
  title: string, completeDocument = false): PdfPianoPreview | null {
  const bars: WrittenBar[] = [], rests: WrittenRest[] = [], clefs: ClefChange[] = [];
  const positions: { geometry: PdfGeometry; measure: LilyPondMeasure; notes: TimedNote[] }[] = [];
  const keySignatures: KeySignature[] = [], timeSignatures: TimeSignature[] = [];
  let current: Clef[] = [], octaves: number[] = [];
  let start = 0, pickup = false;
  pageLoop: for (const [pageNumber, page] of pages.entries()) {
    const pageBars = measures[pageNumber];
    const first = pageBars?.[0];
    if (!pageBars || !first) break;
    const space = first.staves[0]!.space;
    const geometry = { ...page, segments: stemSegments(page, space) };
    const beams = strips(page.fills, space, 1);
    for (const [measureIndex, measure] of pageBars.entries()) {
      const nearby = pageBars.filter(m => m.left < measure.right && m.right > measure.left).flatMap(m => m.staves);
      const glyphs = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right);
      const rows = measure.staves.map(staff => normalizeStaffSigns(rowForStaff(glyphs, staff, nearby), staff));
      if (rows.some(row => row.some(unsupportedRhythmicGlyph))) break pageLoop;
      const meters = rows.map((row, i) => printedMeter(row, measure.staves[i]!));
      const meter = meters.find(value => value) ?? timeSignatures.at(-1);
      if (!meter || meters.some((value, i) => value
        ? value.numerator !== meter.numerator || value.denominator !== meter.denominator
        : meterGlyphs(rows[i]!, measure.staves[i]!).length > 0)) break pageLoop;
      const nominal = meter.numerator * 4 / meter.denominator;
      let key = keySignatures.at(-1)?.fifths ?? 0;
      const content: PdfGlyph[][] = [];
      let signature: number | undefined;
      for (const [i, row] of rows.entries()) {
        const firstAttack = row.find(g => isHead(g) || codePoint(g) >= 0xe4e3 && codePoint(g) <= 0xe4e8);
        if (!firstAttack) break pageLoop;
        const clef = row.find(g => g.x < firstAttack.x && printedClef(codePoint(g)));
        if (!current[i] && !clef) break pageLoop;
        const activeClef = clef ? printedClef(codePoint(clef))!.clef : current[i]!;
        const digits = meterGlyphs(row, measure.staves[i]!);
        const marks = signatureMarks(row, firstAttack, digits, clef, measure.staves[i]!.space);
        if (measure.systemStart || marks.length) {
          const fifths = signatureFifths(marks, keySignatures.at(-1)?.fifths ?? 0, measure.staves[i]!, activeClef);
          if (fifths === null || signature !== undefined && fifths !== signature) break pageLoop;
          signature = fifths;
          key = fifths;
        }
        content.push(placeAccidentals(row.filter(g => !marks.includes(g)), measure.staves[i]!.space));
      }
      const timeBar = (length: number, opening: boolean) => {
        const attacks = content.map((row, i) => lilyPondAttacks(geometry, row, measure.staves[i]!, beams, length));
        return timeLilyPondStaves(attacks, space, length, opening);
      };
      let times = timeBar(nominal, !bars.length);
      const openingMeter = timeSignatures[0];
      if (!times && pickup && completeDocument && pageNumber === pages.length - 1
        && measureIndex === pageBars.length - 1 && meter.numerator === openingMeter?.numerator
        && meter.denominator === openingMeter.denominator) {
        times = timeBar(nominal - bars[0]!.length, false);
      }
      const length = times?.[0]?.length;
      if (!times || !length) break pageLoop;
      const barNotes: TimedNote[] = [], barRests: WrittenRest[] = [], barClefs: ClefChange[] = [];
      const state = { current: [...current], octaves: [...octaves], clefs: barClefs, rests: barRests, notes: barNotes };
      for (const [i, row] of content.entries()) {
        if (!readAttackStaff({
          barIndex: bars.length, staffIndex: i, staff: measure.staves[i]!, glyphs: row,
          timed: times[i]!.timed, start, length, key,
        }, state)) break pageLoop;
      }
      current = state.current;
      octaves = state.octaves;
      if (!bars.length && length < nominal) pickup = true;
      if (key !== keySignatures.at(-1)?.fifths) keySignatures.push({ beat: start, fifths: key, minor: false });
      const previous = timeSignatures.at(-1);
      if (meter.numerator !== previous?.numerator || meter.denominator !== previous.denominator) timeSignatures.push({ ...meter, beat: start });
      bars.push({ start, length, navigation: {} });
      positions.push({ geometry: page, measure, notes: readPianoNoteMarks(rows.flat(), barNotes, space) });
      rests.push(...barRests);
      clefs.push(...barClefs);
      start += length;
    }
  }
  const notes = applyLilyPondTies(positions);
  if (!notes.length) return null;
  const notation: Notation = { title, ...(pickup ? { pickup: true } : {}), bars, notes, rests, clefs,
    keySignatures, timeSignatures, tempos: [], tempoMarks: [], graces: [], pedalMoves: [], pedalMarks: [],
    octaveShifts: [], dynamics: [], dynamicLevels: [], words: [], hairpins: [] };
  return { notation, issues: [] };
}
