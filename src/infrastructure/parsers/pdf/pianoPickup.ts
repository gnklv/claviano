import type { UnresolvedPedal } from './pianoPedalLines';
import { OTTAVA, readBarOctaves } from './pianoOctaves';
import { isBarDirectionGlyph, readBarDirections, readBarWords } from './pianoDirections';
import { isArticulationGlyph, isFermataGlyph, readBarArticulations, readBarFermatas } from './pianoArticulations';
import { isOrnamentGlyph, readBarOrnaments } from './pianoOrnaments';
import { isArpeggioGlyph, isSingleTremoloGlyph, readBarArpeggios } from './pianoTremolos';
import { isGraceGlyph, readBarGraces } from './pianoGraces';
import { readBarTies, type PendingTie } from './pianoTies';
import { readBarAttributes } from './pianoAttributes';
import { readCrossStaff } from './pianoCrossStaff';
import { BEATS, durationBeats } from '../../../domain/notation/noteValue';
import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph, PdfPoint } from './geometry';
import {
  TREBLE, BASS, pianoStaffPairs, musicGlyphs, timeOf, keyOf, strips, sortedX,
  codePoint, within, top, center, isHead, isAccidental, type BeamStrip, type Measure, type Staff,
} from './pianoGeometry';
import { isNoteParenthesis, timedCueGlyphs, readNoteDetails } from './pianoDetails';
import { isNavigationGlyph, readBarNavigation } from './pianoNavigation';
import { readPolyphonicStaff, readTrailingVoice } from './pianoVoices';
import { isTupletGlyph, readTuplets } from './pianoTuplets';
import { readBarHairpins } from './pianoHairpins';
import { roundDotCenter } from './curves';
import { dotAtHead, durationDotCandidates, readEvents, readVoice, validStemGroups, type TimedNote } from './pianoNotes';

const WHOLE_REST = 0xe4e3;
const REST_VALUES = ['half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond'] as const;

function closedAtRight(geometry: PdfGeometry, measure: Measure, staff: Staff): boolean {
  const [upper, lower] = measure.staves;
  const space = staff.space;
  const lines = geometry.segments.filter(line => {
    if (!within(line.x1, measure.right, space * 1.6) || !within(line.x1, line.x2, 0.04)) return false;
    const high = Math.max(line.y1, line.y2), low = Math.min(line.y1, line.y2);
    return (within(high, top(staff), 0.04) && within(low, staff.bottom, 0.04))
      || (within(high, top(upper), 0.04) && within(low, lower.bottom, 0.04));
  });
  if (lines.some(line => within(line.x1, measure.right, space * 0.2))) return true;
  // Both strokes of a repeat or final barline can sit on one side of the staff's endpoint.
  return lines.some(left => lines.some(right => within(right.x1 - left.x1, space * 0.72, space * 0.12)
    && (within(right.x1, measure.right - space * 0.25, space * 0.12)
      || within(left.x1, measure.right + space * 0.75, space * 0.12))));
}

interface Column {
  readonly x: number;
  readonly beat: number;
}

function alignedColumns(columns: readonly Column[], space: number): boolean {
  return columns.every((column, i) => {
    const previous = columns[i - 1];
    if (!previous) return true;
    return within(previous.x, column.x, space * 0.15)
      ? previous.beat === column.beat : previous.beat < column.beat;
  });
}

/** An opening incomplete bar can be timed independently on both staves. Only
 * accept a single note voice or a single ordinary rest per staff here. */
function openingPickup(geometry: PdfGeometry, measure: Measure, title: string): Notation | null {
  const [upper, lower] = measure.staves;
  const glyphsByStaff = measure.staves.map(staff => musicGlyphs(geometry.glyphs, measure, staff));
  // Grace notes, ledger notes beyond the supported range and ornaments can
  // have a different size or sit outside the ordinary staff band.
  const assigned = new Set(glyphsByStaff.flat());
  if (geometry.glyphs.some(g => codePoint(g) >= 0xe000 && codePoint(g) <= 0xf8ff
    && g.x > measure.left && g.x < measure.right && g.y > lower.bottom - lower.space * 6
    && g.y < top(upper) + upper.space * 6 && !assigned.has(g))) return null;
  const beams = strips(geometry.fills, upper.space);
  const clefs: Notation['clefs'][number][] = [];
  const notes: WrittenNote[] = [];
  const rests: Notation['rests'][number][] = [];
  const columns: Column[] = [];
  let time: ReturnType<typeof timeOf> = null;
  let fifths: number | null = null;
  let length = 0;
  for (const [i, staff] of measure.staves.entries()) {
    if (!closedAtRight(geometry, measure, staff)) return null;
    const glyphs = glyphsByStaff[i]!;
    const signs = glyphs.filter(g => [TREBLE, BASS].includes(codePoint(g)));
    const digits = glyphs.filter(g => codePoint(g) >= 0xe080 && codePoint(g) <= 0xe089);
    const signature = timeOf(digits, staff);
    if (signs.length !== 1 || !signature || !digits.length || digits[0]!.x <= signs[0]!.x) return null;
    const firstDigit = digits[0]!.x;
    const lastDigit = digits.at(-1)!.x;
    if (glyphs.some(g => g !== signs[0] && g.x <= lastDigit && !digits.includes(g)
      && !(isAccidental(g) && g.x > signs[0]!.x && g.x < firstDigit))) return null;
    const key = keyOf(glyphs, firstDigit);
    if (key === null || (i > 0 && (key !== fifths || signature.numerator !== time?.numerator
      || signature.denominator !== time.denominator))) return null;
    time = signature;
    fifths = key;
    const clef = codePoint(signs[0]!) === TREBLE ? 'treble' : 'bass';
    clefs.push({ staff: i + 1, beat: 0, clef });
    const symbols = glyphs.filter(g => g.x > lastDigit);
    if (!symbols.length || geometry.curvedFills.some(curve => curve.some(({ from }) =>
      from.x >= symbols[0]!.x && from.x < measure.right && within(from.y, center(staff), staff.space * 5)))) return null;
    const rest = REST_VALUES[codePoint(symbols[0]!) - 0xe4e4];
    let span: number;
    if (rest && symbols.length === 1) {
      span = BEATS[rest];
      rests.push({ staff: i + 1, voice: String(1 + i * 4), beat: 0, duration: { value: rest, dots: 0 },
        clef, measure: false, displayPitch: null });
      columns.push({ x: symbols[0]!.x, beat: 0 });
    } else {
      if (symbols.some(g => !isHead(g) && !isAccidental(g) && !(codePoint(g) >= 0xe240 && codePoint(g) <= 0xe245))) return null;
      const events = readEvents(symbols, staff, geometry.segments, beams);
      if (!events?.length || events.some(e => e.headless)) return null;
      const decorated = new Set<PdfGlyph>();
      for (const symbol of symbols.filter(g => !isHead(g))) {
        const targets = events.filter(({ head, stem }) => isAccidental(symbol)
          ? symbol.x < head.x && head.x - symbol.x < staff.space * 1.5 && within(symbol.y, head.y, staff.space * 0.15)
          : stem && within(symbol.x, stem.x, staff.space * 0.18) && within(symbol.y, stem.far, staff.space * 0.4));
        if (targets.length !== 1) return null;
        if (isAccidental(symbol)) {
          const head = targets[0]!.head;
          if (decorated.has(head)) return null;
          decorated.add(head);
        }
      }
      span = events.reduce((sum, e) => sum + e.beats, 0);
      const read = readVoice(events, symbols, { start: 0, length: span, navigation: {} }, 0, staff,
        i + 1, clef, key, String(1 + i * 4));
      if (!read) return null;
      notes.push(...read.notes.map(e => e.note));
      columns.push(...read.notes.map(e => ({ x: e.x, beat: e.note.beat })));
    }
    if (span >= signature.numerator * 4 / signature.denominator || (i > 0 && span !== length)) return null;
    length = span;
  }
  if (!time || fifths === null || !notes.length) return null;
  const ordered = sortedX(columns);
  if (!alignedColumns(ordered, upper.space)) return null;
  // A bold heading above the system can duplicate the direction aligned to
  // the opening note in a separate italic row. Keep one printed instruction.
  const words: Notation['words'][number][] = [];
  const rows = new Map<number, PdfGlyph[]>();
  for (const glyph of geometry.glyphs) {
    if (glyph.x < measure.left || glyph.x >= measure.right || glyph.y <= top(upper)
      || glyph.y > top(upper) + upper.space * 5 || !/Italic$|Bold$/.test(glyph.font)) continue;
    const row = rows.get(glyph.y) ?? [];
    row.push(glyph);
    rows.set(glyph.y, row);
  }
  for (const row of rows.values()) {
    const chars = sortedX(row);
    if (!within(chars[0]!.x, ordered[0]!.x, upper.space * 0.25)) continue;
    const text = chars.map(g => g.text).join('').trim();
    const bold = [...rows.values()].some(other => sortedX(other.filter(g => /Bold$/.test(g.font)))
      .map(g => g.text).join('').trim() === text);
    if (text) words.push({ text, below: false, beat: 0, tempo: bold });
  }
  return { title, pickup: true, bars: [{ start: 0, length, navigation: {} }], notes, rests, clefs, timeSignatures: [time],
    keySignatures: [{ beat: 0, fifths, minor: false }], tempos: [], tempoMarks: [], pedalMoves: [], pedalMarks: [],
    graces: [], octaveShifts: [], dynamics: [], hairpins: [], dynamicLevels: [], words };
}

export interface PdfPianoPreview {
  notation: Notation;
  issues: UnresolvedPedal[];
}

export function readPickup(geometry: PdfGeometry, title: string): Notation | null {
  return readPickupPreview(geometry, title)?.notation ?? null;
}

function* followingMeasures(first: PdfGeometry, remaining: Measure[], pages: Iterable<PdfGeometry>) {
  let geometry = first;
  let measures = remaining;
  const iterator = pages[Symbol.iterator]();
  for (;;) {
    for (const [i, measure] of measures.entries()) yield { geometry, measure, next: measures[i + 1] };
    const nextPage = iterator.next();
    if (nextPage.done) return;
    geometry = nextPage.value;
    measures = pianoStaffPairs(geometry.segments);
    if (!measures.length) return;
  }
}

export function readPickupPreview(first: PdfGeometry, title: string, furtherPages: Iterable<PdfGeometry> = [], limit = Infinity): PdfPianoPreview | null {
  const [measure, ...following] = pianoStaffPairs(first.segments);
  if (!measure) return null;
  const pickup = openingPickup(first, measure, title);
  if (!pickup) return null;
  let preview = pickup;
  let complete: PdfPianoPreview = { notation: pickup, issues: [] };
  let issues: UnresolvedPedal[] = [];
  let pending: PendingTie[] = [];
  let previous = measure;
  let previousPage = first;
  let pedalOpen = false;
  for (const { geometry, measure: next, next: after } of followingMeasures(first, following, furtherPages)) {
    if (preview.bars.length >= limit) break;
    const pageBreak = previousPage !== geometry;
    const newSystem = pageBreak || top(next.staves[0]) < previous.staves[1].bottom;
    let number: PdfGlyph[] = [];
    if (newSystem) {
      // A printed system number also rules out skipping a measure with missing rulings.
      const upper = next.staves[0];
      number = sortedX(geometry.glyphs.filter(g => /^\d$/.test(g.text)
        && within(g.x, next.left, upper.space * 1.5)
        && g.y > top(upper) + upper.space * 2 && g.y < top(upper) + upper.space * 5));
      if (number.length && number.map(g => g.text).join('') !== String(preview.bars.length)) break;
    } else if (!within(next.left, previous.right, 0.04)
      || !next.staves.every((staff, j) => within(staff.bottom, previous.staves[j]!.bottom, 0.04)
        && within(staff.space, previous.staves[j]!.space, 0.04))) break;
    const extended = readFollowingBar(geometry, next, preview, pending, newSystem, number, previous, previousPage, after);
    if (!extended || extended.pedalFromPrevious !== pedalOpen || (pedalOpen && newSystem)) break;
    pedalOpen = extended.pedalContinues;
    preview = extended.notation;
    pending = extended.pending;
    if (extended.issues.length) issues = [...issues, ...extended.issues];
    if (!pending.length && !pedalOpen) complete = { notation: preview, issues };
    previousPage = geometry;
    previous = next;
  }
  return complete;
}

/** Append the bar once its printed symbols and the timelines of both staves agree. */
function readFollowingBar(geometry: PdfGeometry, measure: Measure, preview: Notation, pending: PendingTie[],
  newSystem: boolean, systemNumber: PdfGlyph[], previousMeasure: Measure, previousPage: PdfGeometry, next?: Measure,
): { notation: Notation; issues: UnresolvedPedal[]; pending: PendingTie[]; pedalContinues: boolean; pedalFromPrevious: boolean } | null {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const inside = (p: PdfPoint) => p.x > measure.left && p.x < measure.right
    && p.y > lower.bottom - space * 5 && p.y < top(upper) + space * 6;
  const printed = sortedX(geometry.glyphs.filter(g => inside(g) && codePoint(g) >= 0xe000 && codePoint(g) <= 0xf8ff));
  const attributes = readBarAttributes(geometry, measure, printed, preview, newSystem, previousMeasure, next, previousPage);
  if (!attributes) return null;
  const { clefs, fifths, time } = attributes;
  const cues = timedCueGlyphs(attributes.glyphs, measure, geometry.segments);
  const graceGlyphs = attributes.glyphs.filter(g => !cues.has(g) && isGraceGlyph(g, space));
  const glyphs = attributes.glyphs.filter(g => !graceGlyphs.includes(g) && !isBarDirectionGlyph(g, measure)
    && !isNoteParenthesis(g) && !isNavigationGlyph(g, measure)
    && !isArticulationGlyph(g) && !isFermataGlyph(g) && !isOrnamentGlyph(g, space) && !isArpeggioGlyph(g)
    && codePoint(g) !== OTTAVA);
  const middle = (upper.bottom + top(lower)) / 2;
  const dottedSymbols = glyphs.filter(g => isHead(g) || REST_VALUES[codePoint(g) - 0xe4e4]);
  if (glyphs.some(g => !isTupletGlyph(g) && ((!cues.has(g) && !within(g.size, space * 4, space * 0.2))
    || (!isHead(g) && !isAccidental(g) && !isFlag(g) && !isSingleTremoloGlyph(g) && codePoint(g) !== WHOLE_REST && !REST_VALUES[codePoint(g) - 0xe4e4])))) return null;
  const dots: PdfPoint[] = [];
  const articulationDots: PdfPoint[] = [];
  const curves: PdfGeometry['curvedFills'] = [];
  const roundDots: PdfPoint[] = [];
  const twiceDotted = new Set<PdfGlyph>();
  for (const contour of geometry.curvedFills) {
    if (!contour.some(curve => inside(curve.from) || inside(curve.to))) continue;
    const dot = roundDotCenter(contour, space);
    if (!dot) {
      const smallDot = cues.size && roundDotCenter(contour, space * 0.75);
      if (smallDot && [...cues].some(g => isHead(g) && smallDot.x - g.x > space && smallDot.x - g.x < space * 1.7
        && within(smallDot.y, g.y, space * 0.55))) {
        dots.push(smallDot);
        continue;
      }
      curves.push(contour);
      continue;
    }
    roundDots.push(dot);
  }
  for (const dot of sortedX(roundDots)) {
    const first = dots.find(p => within(dot.x - p.x, space * 0.75, space * 0.1)
      && within(dot.y, p.y, space * 0.06));
    if (first) {
      const targets = durationDotCandidates(first, dottedSymbols, space);
      if (targets.length !== 1 || twiceDotted.has(targets[0]!)) return null;
      twiceDotted.add(targets[0]!);
      continue;
    }
    const targets = durationDotCandidates(dot, dottedSymbols, space);
    if (targets.length > 1 && (targets.some(g => !isHead(g))
      || targets.some(g => (g.y > middle) !== (targets[0]!.y > middle)))) return null;
    if (targets.length) dots.push(dot);
    else articulationDots.push(dot);
  }
  if (dottedSymbols.some(head => !isHead(head) && dots.filter(dot => dotAtHead(dot, head, space)).length > 1)) return null;
  const previous = preview.bars.at(-1)!;
  const bar = { start: previous.start + previous.length, length: time.numerator * 4 / time.denominator, navigation: {} };
  const beams = strips(geometry.fills, space);
  const notes: TimedNote[] = [];
  const rests: Notation['rests'][number][] = [];
  const columns: Column[] = [];
  const crossStaff = !dots.length ? readCrossStaff(geometry, measure, glyphs, middle, beams, bar, preview.bars.length, clefs, fifths) : null;
  if (crossStaff) notes.push(...crossStaff);
  for (const [i, staff] of measure.staves.entries()) {
    if (!closedAtRight(geometry, measure, staff)) return null;
    if (crossStaff) continue;
    const symbols = glyphs.filter(g => (g.y > middle) === (i === 0));
    const voice = (symbols.some(g => cues.has(g)) ? null
      : readFollowingStaff(geometry, staff, symbols, beams, dots, bar, preview.bars.length, i + 1, clefs[i]!, fifths, twiceDotted))
      ?? readPolyphonicStaff(symbols, staff, geometry.segments, beams, dots.filter(dot => (dot.y > middle) === (i === 0)), bar, preview.bars.length, i + 1,
        clefs[i]!, fifths)
      ?? readTrailingVoice(symbols, staff, geometry.segments, beams, bar, preview.bars.length, i + 1, clefs[i]!, fifths, notes);
    if (!voice) return null;
    notes.push(...voice.notes);
    rests.push(...voice.rests.map(e => e.rest));
    columns.push(...voice.rests.filter(e => !e.rest.measure).map(e => ({ x: e.x, beat: e.rest.beat })));
  }
  columns.push(...notes.map(({ x, columnX, note }) => ({ x: columnX ?? x, beat: note.beat })));
  const ordered = sortedX(columns);
  if (!ordered.length || !alignedColumns(ordered, space)) return null;
  const navigation = readBarNavigation(geometry, measure, ordered[0]!.x);
  if (!navigation) return null;
  const transposed = notes.map(entry => {
    const octaves = attributes.changes.clefs.filter(c => c.staff === entry.note.staff).at(-1)?.octaves ?? 0;
    return octaves ? { ...entry, note: { ...entry.note, sounding: entry.note.sounding + 12 * octaves } } : entry;
  });
  const details = readNoteDetails(geometry, measure, printed, transposed);
  if (!details) return null;
  const articulated = readBarArticulations(attributes.glyphs, articulationDots, details.notes, space);
  if (!articulated) return null;
  const held = readBarFermatas(attributes.glyphs, articulated, space);
  if (!held) return null;
  const ornamented = readBarOrnaments(attributes.glyphs, held, measure);
  if (!ornamented) return null;
  const rolled = readBarArpeggios(attributes.glyphs, ornamented, space);
  if (!rolled) return null;
  const shifted = readBarOctaves(geometry, measure, rolled);
  if (!shifted) return null;
  const grace = readBarGraces(geometry, measure, graceGlyphs, shifted.notes, fifths, preview.notes.length);
  if (!grace) return null;
  const tied = readBarTies(curves.filter(curve => !grace.curves.has(curve)), measure, bar, grace.notes, pending, next);
  if (!tied) return null;
  const hairpins = readBarHairpins(geometry, measure, bar, ordered);
  if (!hairpins) return null;
  const directions = readBarDirections(geometry, measure, bar, ordered, preview.bars.length);
  if (!directions) return null;
  const readText = new Set<PdfGlyph>([...systemNumber, ...attributes.readText, ...details.readText, ...navigation.readText, ...directions.readText]);
  const words = readBarWords(geometry, measure, next, printed, ordered[0]!.x, bar.start, preview, readText);
  if (!words) return null;
  if (geometry.glyphs.some(g => inside(g) && g.text.trim() && !printed.includes(g) && !readText.has(g))) return null;
  return { issues: directions.unresolvedPedals, pending: tied.pending, pedalContinues: directions.pedalContinues, pedalFromPrevious: directions.pedalFromPrevious, notation: { ...preview, ...attributes.changes, bars: [...preview.bars, { ...bar, navigation: navigation.navigation }],
    graces: [...preview.graces, ...grace.graces], notes: [...preview.notes, ...tied.notes], rests: [...preview.rests, ...rests],
    hairpins: [...preview.hairpins, ...hairpins], octaveShifts: [...preview.octaveShifts, ...shifted.octaveShifts],
    dynamics: [...preview.dynamics, ...directions.dynamics], pedalMarks: [...preview.pedalMarks, ...directions.pedalMarks],
    pedalMoves: [...preview.pedalMoves, ...directions.pedalMoves], words } };
}

function isFlag(glyph: PdfGlyph): boolean {
  return codePoint(glyph) >= 0xe240 && codePoint(glyph) <= 0xe245;
}

function readFollowingStaff(geometry: PdfGeometry, staff: Staff, symbols: PdfGlyph[], beams: BeamStrip[],
  dots: PdfPoint[], bar: WrittenBar, index: number, number: number, clef: Clef, fifths: number, twiceDotted: Set<PdfGlyph>,
): { notes: TimedNote[]; rests: { x: number; rest: WrittenRest }[] } | null {
  const space = staff.space;
  const voice = String(1 + (number - 1) * 4);
  if (symbols.some(g => codePoint(g) === WHOLE_REST)) {
    const rest = symbols[0]!;
    if (symbols.length !== 1 || !within(rest.y, staff.bottom + space * 3, space * 0.15)) return null;
    return { notes: [], rests: [{ x: rest.x, rest: { staff: number, voice, beat: bar.start,
      duration: { value: 'whole', dots: 0 }, clef, measure: true, displayPitch: null } }] };
  }
  const heads = symbols.filter(isHead);
  const headDots = dots.filter(dot => durationDotCandidates(dot, heads, space).length > 0);
  const events = readEvents(symbols, staff, geometry.segments, beams, headDots, true)?.map(event => {
    if (!twiceDotted.has(event.head)) return event;
    const duration = { ...event.duration, dots: 2 as const };
    return { ...event, duration, beats: durationBeats(duration) };
  });
  if (!events || events.some(e => e.headless)) return null;
  if (!validStemGroups(events, space)) return null;
  const flagged = new Set<PdfGlyph>();
  for (const glyph of symbols.filter(isFlag)) {
    const targets = events.filter(e => e.stem && e.stem.up === (codePoint(glyph) % 2 === 0)
      && within(glyph.x, e.stem.x, space * 0.18) && within(glyph.y, e.stem.far, space * 0.4));
    const target = targets[0];
    if (targets.length !== 1 || !target || flagged.has(target.head)) return null;
    flagged.add(target.head);
  }
  const pauses = symbols.flatMap(rest => {
    const value = REST_VALUES[codePoint(rest) - 0xe4e4];
    const dotted = dots.some(dot => dotAtHead(dot, rest, space));
    if (!value) return [];
    const duration = { value, dots: twiceDotted.has(rest) ? 2 as const : dotted ? 1 as const : 0 as const };
    return [{ rest, duration, beats: durationBeats(duration) }];
  });
  if (pauses.some(({ rest }) => !within(rest.y, center(staff), space * 0.15))) return null;
  const tuplets = symbols.some(isTupletGlyph);
  if (tuplets && pauses.length) return null;
  const timed = tuplets
    ? readTuplets(events, symbols, geometry.segments, space, bar.length)
    : events;
  if (!timed) return null;
  const timeline = [...timed, ...pauses].sort((a, b) =>
    ('rest' in a ? a.rest : a.head).x - ('rest' in b ? b.rest : b.head).x);
  return readVoice(timeline, symbols, bar, index, staff, number, clef, fifths, voice);
}
