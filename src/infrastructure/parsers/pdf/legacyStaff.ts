import type { WrittenBar } from '../../../domain/notation/notation';
import { BEATS, writtenDuration, type NoteValue } from '../../../domain/notation/noteValue';
import { keyAlteration, midiOf, type Alteration } from '../../../domain/notation/spelling';
import type { BeamMark, Clef, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import { musicGlyphCode as code, isLegacyMusicGlyph } from './musicGlyphs';
import { ACCIDENTALS, BEAM_VALUES, beamMarks, pitchAt, strips, type Staff } from './pianoGeometry';
interface Event {
  x: number;
  heads: PdfGlyph[];
  up: boolean;
  value: NoteValue;
  beams: BeamMark[];
  triplet: boolean;
  dots?: 0 | 1 | 2;
  span?: number;
  ratio?: { actual: number; normal: number };
  tupletFirst?: boolean;
  tupletLast?: boolean;
  bracket?: boolean;
  tremolo?: WrittenNote['tremolo'];
  rest?: PdfGlyph;
}

export interface Onset {
  centeredRest?: boolean;
  rest?: { staff: number; beats: number };
  beat: number;
  x: number;
}

export interface PlacedNote {
  x: number;
  y: number;
  note: WrittenNote;
}

export const isHead = (g: PdfGlyph) => code(g) === 0xe0a3 || code(g) === 0xe0a4;
export const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

export function stemFor(head: PdfGlyph, lines: PdfSegment[], space: number, occupied?: Map<PdfSegment, PdfGlyph[]>): PdfSegment | undefined {
  const candidates = lines.filter((s) => {
    // Superimposed unison heads belong to separate stems when both are printed.
    if (occupied?.get(s)?.some(h => close(h.x, head.x, space * 0.02)
      && close(h.y, head.y, space * 0.02))) return false;
    const dx = (s.x1 - head.x) / space;
    const lo = Math.min(s.y1, s.y2);
    const hi = Math.max(s.y1, s.y2);
    return (
      (close(dx, 0.05, 0.12) || close(dx, 1.25, 0.17)) && head.y >= lo - space * 0.24 && head.y <= hi + space * 0.24
    );
  });
  const distance = (s: PdfSegment) => Math.min(Math.abs(head.y - s.y1), Math.abs(head.y - s.y2));
  return candidates.sort((a, b) => distance(a) - distance(b))[0];
}

// MuseScore draws single-note tremolo strokes as short rising strips
// centered over the stem. A beam or beam hook runs away from the stem.
function tremoloStrips(beams: ReturnType<typeof strips>, x: number, far: number, up: boolean, space: number) {
  const candidates = beams.filter(strip => {
    const half = (strip.right - strip.left) / (2 * space);
    const center = (strip.left + strip.right) / 2;
    const rise = (strip.yAt(strip.right) - strip.yAt(strip.left)) / space;
    const inset = (far - strip.yAt(x)) * (up ? 1 : -1) / space;
    return half >= 0.48 && half <= 0.72 && close(center, x, space * 0.12)
      && rise >= 0.38 && rise <= 0.62 && inset >= 0.24 && inset <= 3;
  }).sort((a, b) => a.yAt(x) - b.yAt(x));
  return candidates.length <= 4 && candidates.every((strip, i) => !i
    || close(strip.yAt(x) - candidates[i - 1]!.yAt(x), 0.8 * space, 0.12 * space)) ? candidates : [];
}

function eventsOf(
  geometry: PdfGeometry,
  glyphs: PdfGlyph[],
  staff: Staff,
  beams: ReturnType<typeof strips>,
  full = false,
): Event[] | null {
  const space = staff.space;
  const lines = geometry.segments.filter(
    (s) => close(s.x1, s.x2, 0.02) && Math.abs(s.y1 - s.y2) >= space * 1.8 && Math.abs(s.y1 - s.y2) < space * 12,
  );
  const groups = new Map<PdfSegment, PdfGlyph[]>();
  for (const head of glyphs.filter(isHead)) {
    const stem = stemFor(head, lines, space, groups) ?? stemFor(head, lines, space);
    if (!stem) return null;
    const group = groups.get(stem) ?? [];
    group.push(head);
    groups.set(stem, group);
  }
  const neighbors = [...groups].map(([s, heads]) => {
    const top = Math.max(...heads.map((h) => h.y)),
      bottom = Math.min(...heads.map((h) => h.y));
    const high = Math.max(s.y1, s.y2),
      low = Math.min(s.y1, s.y2),
      up = high - top > bottom - low;
    return { x: s.x1, far: up ? high : low, up };
  });
  const events: Event[] = [];
  if (full) {
    for (const head of glyphs.filter(g => code(g) === 0xe0a2).sort((a, b) => a.x - b.x || a.y - b.y)) {
      const chord = events.find(e => e.heads.some(h => close(h.x, head.x, space * 0.12)
        || close(Math.abs(h.x - head.x), space * 1.85, space * 0.12) && close(Math.abs(h.y - head.y), space * 0.5, space * 0.08)));
      if (chord) chord.heads.push(head);
      else events.push({ x: head.x, heads: [head], up: false, value: 'whole', beams: [], triplet: false });
    }
    for (const chord of events) chord.heads.sort((a, b) => a.y - b.y);
  }
  for (const [stem, heads] of groups) {
    heads.sort((a, b) => a.y - b.y);
    const lo = Math.min(stem.y1, stem.y2);
    const hi = Math.max(stem.y1, stem.y2);
    const up = hi - heads.at(-1)!.y > heads[0]!.y - lo;
    const far = up ? hi : lo;
    const strokes = full ? tremoloStrips(beams, stem.x1, far, up, space) : [];
    const rhythmBeams = strokes.length ? beams.filter(strip => !strokes.includes(strip)) : beams;
    const marks = beamMarks({ x: stem.x1, far, up }, rhythmBeams, space, full ? neighbors : undefined);
    const flag = glyphs.find(
      (g) =>
        code(g) >= 0xe240 && code(g) <= 0xe245 && close(g.x, stem.x1, space * 0.2) && close(g.y, far, space * 0.4),
    );
    const count = flag ? 1 + Math.floor((code(flag) - 0xe240) / 2) : marks.length;
    const value = code(heads[0]!) === 0xe0a3 ? 'half' : BEAM_VALUES[count];
    if (!value || heads.some((head) => code(head) !== code(heads[0]!))) return null;
    events.push({ x: Math.min(...heads.map((h) => h.x)), heads, up, value, beams: marks, triplet: false,
      tremolo: strokes.length ? { type: 'single', strokes: strokes.length } : null });
  }
  const restValues: NoteValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond'];
  for (const rest of glyphs.filter((g) => code(g) >= 0xe4e3 && code(g) <= 0xe4e8 || full && [0xe4f4, 0xe4f5].includes(code(g)))) {
    events.push({
      x: rest.x,
      heads: [],
      up: false,
      rest,
      value: restValues[[0xe4f4, 0xe4f5].includes(code(rest)) ? code(rest) - 0xe4f4 : code(rest) - 0xe4e3]!,
      beams: [],
      triplet: false,
    });
  }
  if (full)
    for (const event of events) {
      const anchors = event.rest ? [event.rest] : event.heads;
      // Opposing voices sharing a pitch are displaced side by side. Their
      // augmentation dots occupy the column to the right of both heads.
      const displaced = events.find(other => event.up && !other.up
        && close(other.x - event.x, space * 1.7, space * 0.15)
        && other.heads.some(h => event.heads.some(a => close(a.y, h.y, space * 0.08))));
      const dots = glyphs.filter(
        (g) =>
          code(g) === 0xe1e7 &&
          anchors.some((a) => g.x > a.x + space && g.x < (displaced?.x ?? a.x) + space * (event.rest && code(event.rest) === 0xe4f5 ? 3.4 : 2.8) && Math.abs(g.y - a.y) < space * 0.75),
      );
      if (dots.length) event.dots = 1;
      if (displaced) displaced.x = event.x;
    }
  events.sort((a, b) => a.x - b.x);
  for (let i = 0; i + 2 < events.length; i++) {
    const run = events.slice(i, i + 3);
    if (run[0]!.beams[0] !== 'begin' || run[1]!.beams[0] !== 'continue' || run[2]!.beams[0] !== 'end') continue;
    const label = geometry.glyphs.some(
      (g) =>
        g.text === '3' &&
        !isLegacyMusicGlyph(g) &&
        g.x >= run[0]!.x &&
        g.x <= run[2]!.x + space &&
        close(g.y, staff.bottom + space * 3, space * 4),
    );
    if (label) for (const event of run) event.triplet = true;
  }
  if (full) {
    // A bracket is drawn in two strokes with a gap centered around the numeral.
    for (const label of geometry.glyphs.filter(g => g.font.includes('Italic') && /^[345]$/.test(g.text))) {
      const arms = geometry.segments.filter(s => s.x2 - s.x1 > space * 0.3
        && Math.abs(s.y2 - s.y1) < (s.x2 - s.x1) * 0.5);
      const left = arms.find(s => close(s.x2, label.x - space * 0.5, space * 0.15)
        && close(s.y2, label.y + space * 0.7, space * 0.25));
      const right = arms.find(s => close(s.x1, label.x + space * 1.5, space * 0.2)
        && close(s.y1, label.y + space * 0.7, space * 0.25));
      if (!left || !right) continue;
      const run = events.filter(e => e.x >= left.x1 - space * 0.65 && e.x <= right.x2 + space * 0.25
        && (e.rest ? [e.rest] : e.heads).some(g => Math.abs(g.y - label.y) < space * 8));
      const actual = Number(label.text), normal = actual - 1;
      if (run.length < 2 || !close(run[0]!.x, left.x1, space * 0.65)
        || !close(run.at(-1)!.x + space, right.x2, space)) continue;
      for (const [i, e] of run.entries()) {
        e.ratio = { actual, normal };
        e.span = BEATS[e.value] * (e.dots ? 1.5 : 1) * normal / actual;
        e.bracket = true;
        e.tupletFirst = i === 0;
        e.tupletLast = i === run.length - 1;
      }
    }
    for (const label of geometry.glyphs.filter(g => g.font.includes('Italic') && /^[468]$/.test(g.text))) {
      const actual = Number(label.text), normal = actual === 6 ? 4 : actual * 3 / 4;
      for (const up of actual === 6 ? [null] : [true, false]) {
        const beamed = events.filter(e => (up === null || e.up === up) && e.beams.length && e.value === 'sixteenth');
        for (let start = 0; start + actual <= beamed.length; start++) {
          const run = beamed.slice(start, start + actual);
          const enclosed = run[0]!.beams.some((mark, level) =>
            mark === 'begin' && run[actual - 1]!.beams[level] === 'end'
            && run.slice(1, -1).every(e => e.beams[level] === 'continue'));
          if (actual !== 6 && !enclosed
            || !close(label.x, (run[0]!.x + run[actual - 1]!.x) / 2 + space * 0.6, space * 1.25)
            || !run.every(e => e.heads.some(h => close(h.y, label.y, space * 8)))) continue;
          for (const [i, e] of run.entries()) {
            e.ratio = { actual, normal };
            e.span = BEATS.sixteenth * normal / actual;
            e.tupletFirst = i === 0;
            e.tupletLast = i === actual - 1;
          }
        }
      }
    }
    // Multiple tuplets may share one continuous primary beam. The numeral sits
    // above or below the middle stem of its three-note group.
    const labels = geometry.glyphs.filter((g) => g.font.includes('Italic') && g.text === '3');
    for (const label of labels) {
      const middle = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.beams.length && e.heads.some((h) => Math.abs(h.y - label.y) < space * 10))
        .sort((a, b) => Math.abs(a.e.x + (a.e.up ? 0.6 : -0.45) * space - label.x) - Math.abs(b.e.x + (b.e.up ? 0.6 : -0.45) * space - label.x))[0];
      if (!middle || Math.abs(middle.e.x + (middle.e.up ? 0.6 : -0.45) * space - label.x) > space * 1.3) continue;
      const line = events.filter(e => e.up === middle.e.up && e.beams.length);
      const pivot = line.indexOf(middle.e);
      const run = line.slice(pivot - 1, pivot + 2);
      if (run.length !== 3 || !run.every((e) => e.beams.length && e.value === middle.e.value)) continue;
      for (const [k, e] of run.entries()) {
        e.triplet = true;
        e.tupletFirst = k === 0;
        e.tupletLast = k === 2;
      }
    }
  }
  return events;
}

const duration = (e: Event) => e.span ?? BEATS[e.value] * (e.triplet ? 2 / 3 : 1) * (e.dots ? 1.5 : 1);
const sum = (events: Event[]) => events.reduce((n, e) => n + duration(e), 0);

/** Engravers can reverse stems when the voices cross. Simultaneous columns
 * establish both clocks; subsequent attacks follow their preceding durations. */
function crossedVoices(events: Event[], length: number, space: number): Event[][] | null {
  const voices: Event[][] = [[], []];
  const clocks = [0, 0];
  for (let i = 0; i < events.length;) {
    const first = events[i]!;
    let end = i + 1;
    while (end < events.length && close(first.x, events[end]!.x, space * 0.18)) end++;
    const column = events.slice(i, end);
    if (column.length > 2 || !i && column.length !== 2) return null;
    const next = Math.min(...clocks);
    const available = clocks.flatMap((beat, v) => close(beat, next, 0.001) ? [v] : []);
    if (column.length > available.length) return null;
    if (column.length === 2) column.sort((a, b) => Number(b.up) - Number(a.up));
    for (const [j, e] of column.entries()) {
      const v = available[j]!;
      clocks[v]! += duration(e);
      voices[v]!.push(e);
    }
    i = end;
  }
  return clocks.every(beat => close(beat, length, 0.001)) ? voices : null;
}

export function readStaff(
  geometry: PdfGeometry,
  glyphs: PdfGlyph[],
  staff: Staff,
  clef: Clef,
  fifths: number,
  bar: WrittenBar,
  index: number,
  number: number,
  beams: ReturnType<typeof strips>,
  notes: PlacedNote[],
  rests: WrittenRest[],
  onsets: Onset[],
  full = false,
  changes: readonly { x: number; clef: Clef }[] = [],
): boolean {
  const events = eventsOf(geometry, glyphs, staff, beams, full);
  if (!events?.length) return false;
  const space = staff.space;
  if (events.length === 1 && events[0]?.rest && events[0].value === 'whole') events[0].span = bar.length;
  if (full && events.length === 2 && events.every(e => e.rest && e.value === 'whole') && (events.some(e => e.dots) || close(events[0]!.x, events[1]!.x, space * 0.12))) {
    for (const e of events) if (!e.dots) e.span = bar.length;
  }
  if (full && !close(sum(events), bar.length, 0.001)) {
    // A secondary beam enclosing seven 32nds can carry an unnumbered
    // septuplet. Its six-note span must close the independently known bar.
    const start = events.findIndex((e) => e.beams[2] === 'begin');
    const run = start < 0 ? [] : events.slice(start, start + 7);
    if (
      run.length === 7 &&
      run[6]?.beams[2] === 'end' &&
      run.every((e) => e.value === 'thirtySecond') &&
      close(sum(events) - 7 * BEATS.thirtySecond + 6 * BEATS.thirtySecond, bar.length, 0.001)
    ) {
      for (const [k, e] of run.entries()) {
        e.ratio = { actual: 7, normal: 6 };
        e.span = (BEATS.thirtySecond * 6) / 7;
        e.tupletFirst = k === 0;
        e.tupletLast = k === 6;
      }
    }
  }
  if (full && !close(sum(events), bar.length, 0.001)) {
    const staffMiddle = staff.bottom + space * 2;
    for (const [i, e] of events.entries())
      if (e.rest) {
        const other = events.find((other, j) => j !== i && other.rest && close(other.x, e.x, space * 0.1));
        e.up = other ? events.indexOf(other) > i : e.rest.y > staffMiddle + space * 0.2;
      }
  }
  // A stemless whole note can form the upper voice over lower, down-stemmed notes.
  if (full && !close(sum(events), bar.length, 0.001)) {
    const sustained = events.filter(e => !e.rest && e.value === 'whole' && close(duration(e), bar.length, 0.001));
    if (sustained.length === 1 && close(sum(events) - bar.length, bar.length, 0.001)) {
      const other = events.find(e => e !== sustained[0] && e.heads.length);
      if (other) sustained[0]!.up = !other.up;
    }
  }
  let voices = close(sum(events), bar.length, 0.001)
    ? [events]
    : [events.filter((e) => e.up), events.filter((e) => !e.up)];
  if (full && voices.length === 2 && events.every(e => e.up)) {
    const overlapping = events.filter(e => events.some(n => n !== e && close(n.x, e.x, space * 1.45))
      && close(sum(events) - duration(e), bar.length, 0.001));
    if (overlapping.length === 1) voices = [events.filter(e => e !== overlapping[0]), overlapping];
  }
  if (full && voices.length === 2 && !voices.every(group => close(sum(group), bar.length, 0.001))) {
    voices = crossedVoices(events, bar.length, space) ?? voices;
  }
  if (full && voices.length > 1) {
    const sustained = events.find(e => e.value === 'whole' && !e.rest && close(duration(e), bar.length, 0.001));
    const opening = sustained && events.find(e => e.rest && close(e.x, sustained.x, space * 0.5));
    if (sustained && opening) {
      const moving = events.filter(e => e !== sustained && e !== opening);
      const upper = [opening, ...moving.filter(e => e.up)];
      const lower = moving.filter(e => !e.up);
      const four = upper.filter(e => e.ratio?.actual === 4 && !e.bracket);
      if (four.length === 4 && close(sum(upper) + sum(four) / 3, bar.length, 0.001)) {
        // Only the numerator appears in print. The sustained voice fixes the
        // total so a 4:4 ornamental group can be distinguished from 4:3.
        for (const e of four) {
          e.ratio = { actual: 4, normal: 4 };
          e.span = BEATS[e.value];
        }
      }
      if (lower.length && close(sum(upper), bar.length, 0.001)
        && close(sum(lower) + duration(opening), bar.length, 0.001)) voices = [[sustained], upper, lower];
    }
  }
  // Written accidentals apply across voices in their order on the page.
  const clefAt = (x: number) => changes.filter(change => change.x < x).at(-1)?.clef ?? clef;
  const state = new Map<number, Alteration>();
  const unused = new Set(glyphs.filter((g) => code(g) >= 0xe260 && code(g) <= 0xe264));
  const pitches = new Map<PdfGlyph, Pick<WrittenNote, 'pitch' | 'accidental'>>();
  for (const event of events) {
    for (const head of event.heads) {
      const position = pitchAt(head.y, staff, clefAt(head.x));
      if (!position) return false;
      const printed = [...unused]
        .filter(g => close(g.y, head.y, space * 0.18) && g.x < head.x
          && (head.x - g.x < space * 2.6 || full && head.x - g.x < space * 5
            && !events.some(other => other !== event && other.x > g.x && other.x < event.x - space * 0.15)))
        .sort((a, b) => b.x - a.x)[0];
      const accidental = printed && ACCIDENTALS[code(printed) - 0xe260];
      const degree = position.octave * 7 + position.letter;
      if (printed && accidental) {
        unused.delete(printed);
        state.set(degree, accidental[1]);
      }
      const pitch = { ...position, alteration: state.get(degree) ?? keyAlteration(position.letter, fifths) };
      pitches.set(head, { pitch, accidental: accidental?.[0] ?? null });
    }
  }
  if (unused.size && !full) return false;
  const ownColumns: Onset[] = [];
  for (const [v, group] of voices.entries()) {
    const firstColumn =
      full && v && group.length ? ownColumns.find((c) => close(c.x, group[0]!.x, space * 1.45)) : null;
    const startBeat = firstColumn?.beat ?? bar.start;
    const available = bar.length - (startBeat - bar.start);
    if (!close(sum(group), available, 0.001)) {
      // MuseScore can omit trailing rests in a secondary voice. Every retained
      // attack must coincide with a printed onset in the complete voice.
      let position = startBeat;
      if (!full || !v || !group.length || sum(group) > available || !group.every(e => {
        const aligned = ownColumns.some(c => close(c.x, e.x, space * 1.45) && close(c.beat, position, 0.001));
        position += duration(e);
        return aligned;
      })) return false;
    }
    let offset = startBeat - bar.start;
    const voice = String((number - 1) * 4 + v + 1);
    for (const event of group) {
      const beat = bar.start + offset;
      onsets.push({ beat, x: event.x, centeredRest: !!event.rest && (event.span != null && !event.ratio || event.value === 'whole' && close(duration(event), bar.length, 0.001)),
        ...(event.rest ? { rest: { staff: number, beats: duration(event) } } : {}) });
      ownColumns.push({ beat, x: event.x });
      const written = event.rest && event.span != null && !event.ratio
        ? writtenDuration(event.span)
        : { value: event.value, dots: event.dots ?? 0 };
      const tupletStart = (event.tupletFirst ?? (event.triplet && event.beams[0] === 'begin'))
        ? { showNumber: !!event.bracket || !event.ratio || event.ratio.actual !== 7, bracket: !!event.bracket }
        : null;
      if (event.rest) {
        const restClef = clefAt(event.rest.x);
        const measure = event.span != null && !event.ratio;
        const middle = staff.bottom + 2 * space;
        const up = voices.length === 3 ? v % 2 === 0 : event.up;
        // Whole rests hang from the line above the anchor used by other rests.
        // A lower polyphonic whole rest hangs from the bottom staff line.
        const defaultPosition = voices.length > 1
          ? up ? (event.value === 'whole' ? 5 : 4) : 0
          : event.value === 'whole' ? 3 : 2;
        const displacement = (event.rest.y - staff.bottom) / space - defaultPosition;
        // MuseScore's written display position uses a whole-space offset from
        // the middle line, even when the printed rest is moved by a fraction.
        const spaces = Math.sign(displacement) * Math.round(Math.abs(displacement));
        const shifted = full
          ? spaces ? pitchAt(middle + spaces * space, staff, restClef) : null
          : voices.length > 1 ? pitchAt(event.rest.y + (event.up ? -2 : 2) * space, staff, restClef) : null;
        rests.push({
          staff: number,
          voice,
          beat,
          duration: written,
          ...(event.ratio ? { tuplet: event.ratio } : event.triplet ? { tuplet: { actual: 3, normal: 2 } } : {}),
          ...(tupletStart ? { tupletStart } : {}),
          ...(event.tupletLast ? { tupletStop: true } : {}),
          measure,
          displayPitch: shifted,
          clef: restClef,
        });
      }
      for (const [i, head] of event.heads.entries()) {
        const { pitch, accidental } = pitches.get(head)!;
        const arpeggio = glyphs.some(
          (g) =>
            [0xeaa9, 0xeaad].includes(code(g)) &&
            (full
              ? g.x < event.x &&
                event.x - g.x < space * 3.8 &&
                !events.some((e) => e !== event && e.x > g.x && e.x < event.x - space * 0.2)
              : close(g.x, event.x - space * 0.5, space * 0.25)) &&
            g.y >= event.heads[0]!.y - space * 2 &&
            g.y <= event.heads.at(-1)!.y + space * 2,
        );
        const accent =
          !i &&
          glyphs.some(
            (g) =>
              [0xe4a0, 0xe4a1].includes(code(g)) &&
              close(g.x, event.x, space * 0.3) &&
              Math.min(...event.heads.map((h) => Math.abs(h.y - g.y))) < space * 4.5,
          );
        const articulation =
          !i &&
          glyphs.find(
            (g) =>
              [0xe4a2, 0xe4a3, 0xe4a4, 0xe4a5].includes(code(g)) &&
              close(g.x, event.x + space * 0.6, space * 0.45) &&
              event.heads.some((h) => Math.abs(g.y - h.y) < space * 5),
          );
        const fermata = !i && glyphs.some((g) => code(g) === 0xe4c0 && close(g.x, event.x, space) && g.y > head.y);
        notes.push({
          x: head.x,
          y: head.y,
          note: {
            bar: index,
            staff: number,
            voice,
            hand: number === 1 ? 'right' : 'left',
            chord: i > 0,
            clef: clefAt(head.x),
            pitch,
            sounding: midiOf(pitch),
            beat,
            beats: duration(event),
            duration: written,
            tuplet: event.ratio ?? (event.triplet ? { actual: 3, normal: 2 } : null),
            tupletStart: i ? null : tupletStart,
            tupletStop: !i && (event.tupletLast ?? (event.triplet && event.beams[0] === 'end')),
            accidental,
            stem: event.value === 'whole' ? null : event.up ? 'up' : 'down',
            beams: i ? [] : event.beams,
            tieStart: false,
            tieStop: false,
            articulations: accent
              ? ['accent']
              : articulation
                ? [code(articulation) <= 0xe4a3 ? 'staccato' : 'tenuto']
                : [],
            fermata: fermata ? 'upright' : null,
            slurs: [],
            dynamics: null,
            ornaments: !i && glyphs.some(g => code(g) === 0xe566 && close(g.x, event.x, space)
              && g.y > head.y && g.y < event.heads.at(-1)!.y + space * 8)
              ? [{ kind: 'trill', below: false, accidentalAbove: null, accidentalBelow: null }] : [],
            trillLine: false,
            tremolo: i ? null : event.tremolo ?? null,
            arpeggio: arpeggio ? 'up' : null,
          },
        });
      }
      offset += duration(event);
    }
  }
  return true;
}

/** A reversed chord head may shift a common onset by one head width. Distinct
 * beats must still advance horizontally in every voice on both staves. */
export function alignedColumns(onsets: Onset[], space: number): boolean {
  const sorted = [...onsets].sort((a, b) => a.beat - b.beat || a.x - b.x);
  let beat = -Infinity;
  let left = -Infinity;
  let right = -Infinity;
  let previousRight = -Infinity;
  for (const onset of sorted) {
    if (close(onset.beat, beat, 0.001)) {
      left = Math.min(left, onset.x);
      right = Math.max(right, onset.x);
    } else {
      previousRight = right;
      beat = onset.beat;
      left = right = onset.x;
    }
    if (right - left > space * 1.45 || left <= previousRight + space * 0.15) return false;
  }
  return sorted.length > 0;
}
