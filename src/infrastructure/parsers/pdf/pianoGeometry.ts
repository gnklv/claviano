import type { TempoChange } from '../../../domain/notation/notation';
import type { NoteValue } from '../../../domain/notation/noteValue';
import { BOTTOM_LINE_STEP, pitchAtStaffStep } from '../../../domain/notation/staffPosition';
import type { Accidental, Alteration, Letter } from '../../../domain/notation/spelling';
import type { BeamMark, Clef } from '../../../domain/notation/written';
import type { TempoMark, TimeSignature } from '../../../domain/score';
import type { PdfGlyph, PdfPoint, PdfSegment } from './geometry';

export const PREVIEW_BARS = 4;
export const TREBLE = 0xe050;
export const BASS = 0xe062;
export const WHOLE = 0xe0a2;
export const HALF = 0xe0a3;
export const BLACK = 0xe0a4;
export const DOT = 0xe1e7;
export const FLAT = 0xe260;
const SHARP = 0xe262;
const DOUBLE_FLAT = 0xe264;
const DIGIT_ZERO = 0xe080;
export const PEDAL = 0xe650;
const METRONOME_QUARTER = 0xeca5;
const METRONOME_DOT = 0xecb7;
export const PIANO = 0xe520;
export const codePoint = (glyph: PdfGlyph): number => glyph.text.codePointAt(0) ?? 0;
export const within = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance;
export const sortedX = <T extends { readonly x: number }>(points: readonly T[]): T[] => [...points].sort((a, b) => a.x - b.x);
export const isHead = (glyph: PdfGlyph): boolean => [WHOLE, HALF, BLACK].includes(codePoint(glyph));
export const isAccidental = (glyph: PdfGlyph): boolean => codePoint(glyph) >= FLAT && codePoint(glyph) <= DOUBLE_FLAT;

export interface Staff {
  readonly bottom: number;
  readonly space: number;
}

export interface Measure {
  readonly left: number;
  readonly right: number;
  readonly staves: readonly [Staff, Staff];
}

interface Ruling extends Staff {
  readonly left: number;
  readonly right: number;
}

export interface Stem {
  readonly x: number;
  readonly far: number;
  readonly up: boolean;
}

export interface BeamStrip {
  readonly left: number;
  readonly right: number;
  readonly yAt: (x: number) => number;
}

export const top = (staff: Staff): number => staff.bottom + 4 * staff.space;
export const center = (staff: Staff): number => staff.bottom + 2 * staff.space;

/** Ghostscript emits each run of five staff lines with matching endpoints, normally one run per bar. */
export function rulings(segments: readonly PdfSegment[]): Ruling[] {
  const rows = new Map<string, PdfSegment[]>();
  for (const segment of segments) {
    if (!within(segment.y1, segment.y2, 0.04) || Math.abs(segment.x2 - segment.x1) < 20) continue;
    const key = [Math.min(segment.x1, segment.x2), Math.max(segment.x1, segment.x2)]
      .map((x) => Math.round(x * 10)).join(',');
    const group = rows.get(key) ?? [];
    group.push(segment);
    rows.set(key, group);
  }
  const output: Ruling[] = [];
  for (const group of rows.values()) {
    group.sort((a, b) => a.y1 - b.y1);
    for (let i = 0; i + 4 < group.length; i++) {
      const a = group[i]!;
      const space = (group[i + 4]!.y1 - a.y1) / 4;
      if (space < 1 || !group.slice(i + 1, i + 4).every((line, j) =>
        within(line.y1, a.y1 + space * (j + 1), 0.04))) continue;
      output.push({ left: Math.min(a.x1, a.x2), right: Math.max(a.x1, a.x2), bottom: a.y1, space });
      i += 4;
    }
  }
  return output.sort((a, b) => b.bottom - a.bottom || a.left - b.left);
}

/** Finds pairs of five-line staves with the same horizontal extent. Verovio draws one
 * such pair per written bar, including the pickup and bars with repeat endings. */
export function pianoStaffPairs(segments: readonly PdfSegment[]): Measure[] {
  const waiting = new Map<string, Ruling>();
  const pairs: Measure[] = [];
  for (const staff of rulings(segments)) {
    const key = [staff.left, staff.right].map(x => Math.round(x * 10)).join(',');
    const upper = waiting.get(key);
    if (upper && within(upper.space, staff.space, 0.04) && upper.bottom > top(staff)) {
      pairs.push({ left: upper.left, right: upper.right, staves: [upper, staff] });
      waiting.delete(key);
    } else {
      waiting.set(key, staff);
    }
  }
  return pairs;
}

export function pianoMeasures(segments: readonly PdfSegment[]): Measure[] {
  const lines = rulings(segments);
  const verticals = segments.filter((segment) => within(segment.x1, segment.x2, 0.04));
  return lines.flatMap((upper) => {
    const lower = lines.find((line) =>
      within(upper.left, line.left, 0.1) && within(upper.right, line.right, 0.1)
      && within(upper.space, line.space, 0.04)
      && upper.bottom - top(line) >= upper.space * 3 && upper.bottom - top(line) < upper.space * 10);
    if (!lower) return [];
    const barline = (staff: Staff, end: number): boolean => verticals.some((segment) =>
      within(segment.x1, upper.right, upper.space * 0.25)
      && within(Math.max(segment.y1, segment.y2), top(staff), upper.space * 0.25)
      && within(Math.min(segment.y1, segment.y2), end, upper.space * 0.25));
    const closed = barline(upper, lower.bottom) || (barline(upper, top(lower)) && barline(lower, lower.bottom));
    return closed ? [{ left: upper.left, right: upper.right, staves: [upper, lower] as const }] : [];
  });
}

export function musicGlyphs(glyphs: readonly PdfGlyph[], measure: Measure, staff: Staff): PdfGlyph[] {
  return sortedX(glyphs.filter((glyph) => glyph.x > measure.left && glyph.x < measure.right
    && within(glyph.size, staff.space * 4, staff.space * 0.2)
    && within(glyph.y, center(staff), staff.space * 5)));
}

export function pitchAt(y: number, staff: Staff, clef: Clef): { letter: Letter; octave: number } | null {
  const steps = (y - staff.bottom) * 2 / staff.space;
  const rounded = Math.round(steps);
  if (!within(steps, rounded, 0.14)) return null;
  const pitch = pitchAtStaffStep(BOTTOM_LINE_STEP - rounded, clef);
  return pitch.octave < 0 ? null : pitch;
}

export function keyOf(glyphs: readonly PdfGlyph[], firstHead: number): number | null {
  const marks = glyphs.filter((glyph) => glyph.x < firstHead && isAccidental(glyph));
  if (!marks.length) return 0;
  if (marks.length > 7) return null;
  if (marks.every((mark) => codePoint(mark) === SHARP)) return marks.length;
  if (marks.every((mark) => codePoint(mark) === FLAT)) return -marks.length;
  return null;
}

export function timeOf(glyphs: readonly PdfGlyph[], staff: Staff): TimeSignature | null {
  const digits = glyphs.filter((glyph) => codePoint(glyph) >= DIGIT_ZERO && codePoint(glyph) < DIGIT_ZERO + 10);
  const read = (above: boolean): number =>
    Number(digits.filter((digit) => (digit.y > center(staff)) === above)
      .map((digit) => codePoint(digit) - DIGIT_ZERO).join(''));
  const numerator = read(true);
  const denominator = read(false);
  return numerator >= 1 && numerator <= 32 && [2, 4, 8, 16, 32].includes(denominator)
    ? { beat: 0, numerator, denominator }
    : null;
}

export function strips(polygons: readonly PdfPoint[][], space: number, maxSlope = 0.5): BeamStrip[] {
  const beams: BeamStrip[] = [];
  for (const polygon of polygons) {
    const points = polygon.length === 5 ? polygon.slice(0, 4) : polygon;
    if (points.length !== 4) continue;
    const [lt, lb, rt, rb] = sortedX(points);
    if (!lt || !lb || !rt || !rb || !within(lt.x, lb.x, 0.04) || !within(rt.x, rb.x, 0.04)) continue;
    const span = rt.x - lt.x;
    const height = Math.abs(lt.y - lb.y);
    if (span < space * 0.8 || !within(height, space * 0.5, space * 0.2)
      || !within(height, Math.abs(rt.y - rb.y), space * 0.1)) continue;
    const left = (lt.y + lb.y) / 2;
    const right = (rt.y + rb.y) / 2;
    if (Math.abs(right - left) > span * maxSlope) continue;
    beams.push({ left: lt.x, right: rt.x, yAt: (x) => left + (right - left) * (x - lt.x) / span });
  }
  return beams;
}

export function beamMarks(stem: Stem, beams: readonly BeamStrip[], space: number, neighbors?: readonly Stem[]): BeamMark[] {
  const crosses = (beam: BeamStrip, candidate: Stem): boolean =>
    candidate.x >= beam.left - space * 0.1 && candidate.x <= beam.right + space * 0.1;
  const crossing = beams.filter((beam) => crosses(beam, stem))
    .map((beam) => ({ beam, dy: Math.abs(beam.yAt(stem.x) - stem.far) }))
    .sort((a, b) => a.dy - b.dy);
  if (!crossing[0] || crossing[0].dy > space * 0.4) return [];
  const levels: { dy: number; strips: BeamStrip[] }[] = [];
  for (const { beam, dy } of crossing) {
    if (dy > space * 1.95) break;
    const previous = levels.at(-1);
    // Verovio can draw secondary levels as separate strips meeting at an interior stem.
    if (previous && within(dy, previous.dy, space * 0.1)) previous.strips.push(beam);
    else levels.push({ dy, strips: [beam] });
  }
  return levels.map(({ strips }, level) => {
    const left = strips.some(beam => stem.x - beam.left >= space * 0.15);
    const right = strips.some(beam => beam.right - stem.x >= space * 0.15);
    if (left && right) return 'continue';
    const hook = level > 0 && neighbors && !neighbors.some(candidate =>
      !within(candidate.x, stem.x, space * 0.15) && candidate.up === stem.up
      && strips.some(beam => crosses(beam, candidate)
        && within(beam.yAt(candidate.x), candidate.far, space * 1.95)));
    if (right) return hook ? 'forward hook' : 'begin';
    return hook ? 'backward hook' : 'end';
  });
}

export const BEAM_VALUES: readonly NoteValue[] = ['quarter', 'eighth', 'sixteenth', 'thirtySecond'];

export function startingTempo(glyphs: readonly PdfGlyph[], measure: Measure): { mark: TempoMark; change: TempoChange } | null {
  const staff = measure.staves[0];
  const unit = glyphs.find((glyph) => codePoint(glyph) === METRONOME_QUARTER && glyph.x > measure.left
    && glyph.x < measure.right && glyph.y > top(staff) && glyph.y < top(staff) + staff.space * 6);
  if (!unit) return null;
  const text = sortedX(glyphs.filter((glyph) => glyph.x > unit.x && glyph.x < unit.x + staff.space * 10
    && within(glyph.y, unit.y, staff.space * 0.08)
    && (codePoint(glyph) === METRONOME_DOT || /^[=0-9]$/.test(glyph.text))))
    .map((glyph) => glyph.text).join('');
  const match = /^\uECB7?=(\d{1,3})$/u.exec(text);
  const perMinute = Number(match?.[1]);
  if (!perMinute) return null;
  const dots = text.startsWith(String.fromCodePoint(METRONOME_DOT)) ? 1 : 0;
  return {
    mark: { beat: 0, unit: { value: 'quarter', dots }, perMinute, printed: true },
    change: { bar: 0, beat: 0, bpm: perMinute * (dots ? 1.5 : 1) },
  };
}

export const ACCIDENTALS: readonly [Accidental, Alteration][] = [
  ['flat', -1], ['natural', 0], ['sharp', 1], ['double-sharp', 2], ['double-flat', -2],
];

