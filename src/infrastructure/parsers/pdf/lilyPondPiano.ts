import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, ClefChange, WrittenRest } from '../../../domain/notation/written';
import type { KeySignature, TimeSignature } from '../../../domain/score';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { repeatDots, volta } from './lilyPondRepeats';
import { lilyPondOctaveShifts } from './lilyPondOctaves';
import { applyLilyPondTies } from './lilyPondTies';
import { tempoWord, textRuns } from './pianoDirections';
import { readPianoNoteMarks } from './pianoNoteMarks';
import { signatureFifths } from './pianoKey';
import { lilyGraceAnchors, lilyGraceSymbol, lilyPondGraces } from './lilyPondGraces';
import { applyLongTuplet, numberedLongBeams } from './lilyPondLongTuplets';
import { lilyPondAttacks } from './lilyPondAttacks';
import { timeLilyPondStaves } from './lilyPondTiming';
import { ledgerChordStaff } from './lilyPondLedgerChords';
import { readAttackStaff } from './pianoAttackStaff';
import { center, codePoint, DOT, isAccidental, isHead, isTimeSymbol, printedClef,
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
    // Older LilyPond editions put the time-signature numerals in a separate text font.
    if (/^feta-alphabet\d+$/i.test(glyph.font) && /^[0-9]$/.test(glyph.text)) {
      return { ...glyph, text: String.fromCodePoint(0xe080 + Number(glyph.text)) };
    }
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

function rowForStaff(glyphs: PdfGlyph[], staff: Staff, candidates: Staff[], owners: Map<PdfGlyph, Staff>,
  anchors: Map<PdfGlyph, PdfGlyph>) {
  return sortedX(glyphs.filter(g => {
    if (owners.has(g)) return owners.get(g) === staff;
    const y = (anchors.get(g) ?? g).y;
    return Math.abs(y - center(staff)) < staff.space * 10 && candidates.every(other => other === staff
      || Math.abs(y - center(other)) >= Math.abs(y - center(staff)));
  }));
}

/** LilyPond's opening tempo heading can be flush with the left margin
 * above an indented first system. The heading has its own text baseline. */
function openingTempoWords(page: PdfGeometry, measure: LilyPondMeasure): Notation['words'] {
  const staff = measure.staves[0]!, top = staff.bottom + 4 * staff.space;
  const rows = new Map<number, PdfGlyph[]>();
  for (const glyph of page.glyphs) {
    if (glyph.y <= top || glyph.y > top + 7 * staff.space || glyph.x >= measure.right
      || !/^[\p{L}\p{P} ]+$/u.test(glyph.text)) continue;
    const y = Math.round(glyph.y / staff.space * 20);
    const row = rows.get(y) ?? [];
    row.push(glyph);
    rows.set(y, row);
  }
  return [...rows.values()].flatMap(row => textRuns(row, staff.space).flatMap(run => {
    const text = run.map(g => g.text).join('').trim();
    return tempoWord.test(text) ? [{ beat: 0, below: false, tempo: true, text }] : [];
  }));
}

export function readLilyPondPiano(pages: readonly PdfGeometry[], measures: readonly (readonly LilyPondMeasure[])[],
  title: string, completeDocument = false): PdfPianoPreview | null {
  const bars: WrittenBar[] = [], rests: WrittenRest[] = [], clefs: ClefChange[] = [];
  const graces: Notation['graces'][number][] = [];
  let noteOffset = 0;
  const positions: { geometry: PdfGeometry; measure: LilyPondMeasure; notes: TimedNote[] }[] = [];
  const keySignatures: KeySignature[] = [], timeSignatures: TimeSignature[] = [];
  const staffKeys: number[] = [];
  let current: Clef[] = [], octaves: number[] = [];
  let start = 0, pickup = false;
  let repeatOpening = 0;
  pageLoop: for (const [pageNumber, page] of pages.entries()) {
    const pageBars = measures[pageNumber];
    const first = pageBars?.[0];
    if (!pageBars || !first) break;
    const space = first.staves[0]!.space;
    const geometry = { ...page, segments: stemSegments(page, space) };
    const anchors = lilyGraceAnchors(geometry, space);
    const beams = strips(page.fills, space, 1);
    const measureRows = (measure: LilyPondMeasure) => {
      const nearby = pageBars.filter(m => m.left < measure.right && m.right > measure.left).flatMap(m => m.staves);
      const glyphs = geometry.glyphs.filter(g => {
        const x = (anchors.get(g) ?? g).x;
        return x > measure.left && x < measure.right;
      });
      const owners = ledgerChordStaff(glyphs, geometry.segments, measure, nearby);
      // Dots on ledger notes can lie nearer the opposite staff. Associate
      // them with the head or rest immediately to their left.
      for (const dot of glyphs.filter(g => codePoint(g) === DOT)) {
        const targets = glyphs.filter(g => (isHead(g) || codePoint(g) >= 0xe4e3 && codePoint(g) <= 0xe4e8)
          && dot.x - g.x >= .85 * space && dot.x - g.x <= 4 * space && within(g.y, dot.y, .6 * space));
        const target = targets.sort((a, b) => b.x - a.x)[0];
        if (target) owners.set(dot, owners.get(target) ?? nearby.reduce((a, b) =>
          Math.abs(center(a) - target.y) <= Math.abs(center(b) - target.y) ? a : b));
      }
      return measure.staves.map(staff => normalizeStaffSigns(rowForStaff(glyphs, staff, nearby, owners, anchors), staff));
    };
    const longBeams = numberedLongBeams(geometry, beams, space, pageBars, (measure, staffIndex) => {
      const staff = measure.staves[staffIndex]!;
      const row = measureRows(measure)[staffIndex]!;
      if (meterGlyphs(row, staff).length) return null;
      return lilyPondAttacks(geometry, row, staff, beams, 1);
    });
    for (const [measureIndex, measure] of pageBars.entries()) {
      const rows = measureRows(measure);
      const regular = rows.map((row, i) => row.filter(g => !lilyGraceSymbol(g, measure.staves[i]!.space)));
      const repeat = repeatDots(page, rows, measure);
      if (rows.some(row => row.some(unsupportedRhythmicGlyph))) break pageLoop;
      const meters = rows.map((row, i) => printedMeter(row, measure.staves[i]!));
      const meter = meters.find(value => value) ?? timeSignatures.at(-1);
      if (!meter || meters.some((value, i) => value
        ? value.numerator !== meter.numerator || value.denominator !== meter.denominator
        : meterGlyphs(rows[i]!, measure.staves[i]!).length > 0)) break pageLoop;
      const nominal = meter.numerator * 4 / meter.denominator;
      const previousKeys = [...staffKeys];
      const content: PdfGlyph[][] = [];
      for (const [i, row] of regular.entries()) {
        const firstAttack = row.find(g => isHead(g) || codePoint(g) >= 0xe4e3 && codePoint(g) <= 0xe4e8);
        if (!firstAttack) break pageLoop;
        const clef = row.find(g => g.x < firstAttack.x && printedClef(codePoint(g)));
        if (!current[i] && !clef) break pageLoop;
        const activeClef = clef ? printedClef(codePoint(clef))!.clef : current[i]!;
        const digits = meterGlyphs(row, measure.staves[i]!);
        const marks = signatureMarks(row, firstAttack, digits, clef, measure.staves[i]!.space);
        if (measure.systemStart || marks.length) {
          const fifths = signatureFifths(marks, staffKeys[i] ?? 0, measure.staves[i]!, activeClef);
          if (fifths === null) break pageLoop;
          staffKeys[i] = fifths;
        }
        content.push(placeAccidentals(row.filter(g => !marks.includes(g) && !repeat.dots.has(g)), measure.staves[i]!.space));
      }
      const timeBar = (length: number, opening: boolean) => {
        const attacks = content.map((row, i) => lilyPondAttacks(geometry, row, measure.staves[i]!, beams, length));
        for (const row of attacks) if (row) applyLongTuplet(row, longBeams, space, length);
        return timeLilyPondStaves(attacks, space, length, opening);
      };
      const previousBar = bars.at(-1);
      if (repeat.navigation.repeatStart || previousBar?.navigation.repeatEnd) repeatOpening = bars.length;
      let times = timeBar(nominal, !bars.length);
      const documentEnd = completeDocument && pageNumber === pages.length - 1 && measureIndex === pageBars.length - 1;
      // A repeat can split a measure. The closing fragment completes the pickup
      // it repeats to, and the next section may pick up on the remaining beats.
      const opening = repeat.navigation.repeatEnd ? bars[repeatOpening] : documentEnd && pickup ? bars[0] : undefined;
      const openingMeter = opening && timeSignatures.filter(change => change.beat <= opening.start).at(-1);
      if (!times && opening && opening.length < nominal && meter.numerator === openingMeter?.numerator
        && meter.denominator === openingMeter.denominator) {
        times = timeBar(nominal - opening.length, false);
      }
      if (!times && previousBar?.navigation.repeatEnd && previousBar.length < nominal
        && timeSignatures.at(-1)?.numerator === meter.numerator && timeSignatures.at(-1)?.denominator === meter.denominator) {
        times = timeBar(nominal - previousBar.length, false);
      }
      const length = times?.[0]?.length;
      if (!times || !length) break pageLoop;
      const barNotes: TimedNote[] = [], barRests: WrittenRest[] = [], barClefs: ClefChange[] = [];
      const state = { current: [...current], octaves: [...octaves], clefs: barClefs, rests: barRests, notes: barNotes };
      for (const [i, row] of content.entries()) {
        if (!readAttackStaff({
          barIndex: bars.length, staffIndex: i, staff: measure.staves[i]!, glyphs: row,
          timed: times[i]!.timed, start, length, key: staffKeys[i] ?? 0,
        }, state)) break pageLoop;
      }
      const graceGroups = rows.map((row, i) => lilyPondGraces(geometry, row, measure.staves[i]!,
        i + 1, barNotes, staffKeys[i] ?? 0, noteOffset));
      if (graceGroups.some(groups => !groups)) break pageLoop;
      graces.push(...graceGroups.flatMap(groups => groups ?? []));
      noteOffset += barNotes.length;
      current = state.current;
      octaves = state.octaves;
      if (!bars.length && length < nominal) pickup = true;
      if (staffKeys.some((key, i) => key !== previousKeys[i])) {
        if (staffKeys.every(key => key === staffKeys[0])) {
          keySignatures.push({ beat: start, fifths: staffKeys[0]!, minor: false });
        } else {
          staffKeys.forEach((fifths, i) => keySignatures.push({ beat: start, staff: i + 1, fifths, minor: false }));
        }
      }
      const previous = timeSignatures.at(-1);
      if (meter.numerator !== previous?.numerator || meter.denominator !== previous.denominator) timeSignatures.push({ ...meter, beat: start });
      bars.push({ start, length, navigation: { ...repeat.navigation, ...volta(page, measure) } });
      positions.push({ geometry: page, measure, notes: readPianoNoteMarks(rows.flat(), barNotes, space) });
      rests.push(...barRests);
      clefs.push(...barClefs);
      start += length;
    }
  }
  const octaveShifts = lilyPondOctaveShifts(positions);
  function shiftSounding<T extends { sounding: number; staff: number }>(note: T, beat: number): T {
    const shift = octaveShifts.find(s => s.staff === note.staff && beat >= s.start && beat < s.end);
    return shift ? { ...note, sounding: note.sounding + 12 * shift.octaves } : note;
  }
  const soundingPositions = octaveShifts.length ? positions.map(bar => ({ ...bar,
    notes: bar.notes.map(head => ({ ...head, note: shiftSounding(head.note, head.note.beat) })),
  })) : positions;
  const notes = applyLilyPondTies(soundingPositions);
  if (!notes.length) return null;
  const notation: Notation = { title, ...(pickup ? { pickup: true } : {}), bars, notes, rests, clefs,
    keySignatures, timeSignatures, tempos: [], tempoMarks: [],
    graces: graces.map(group => ({ ...group, notes: group.notes.map(note => shiftSounding(note, group.beat)) })), pedalMoves: [], pedalMarks: [],
    octaveShifts, dynamics: [], dynamicLevels: [], words: openingTempoWords(pages[0]!, measures[0]![0]!), hairpins: [] };
  return { notation, issues: [] };
}
