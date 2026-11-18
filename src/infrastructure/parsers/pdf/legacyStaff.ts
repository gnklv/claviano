import type { WrittenBar } from '../../../domain/notation/notation';
import { BEATS, type NoteValue } from '../../../domain/notation/noteValue';
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
  rest?: PdfGlyph;
}

export interface Onset {
  centeredRest?: boolean;
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

export function stemFor(head: PdfGlyph, lines: PdfSegment[], space: number): PdfSegment | undefined {
  const candidates = lines.filter((s) => {
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
    const stem = stemFor(head, lines, space);
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
  for (const [stem, heads] of groups) {
    heads.sort((a, b) => a.y - b.y);
    const lo = Math.min(stem.y1, stem.y2);
    const hi = Math.max(stem.y1, stem.y2);
    const up = hi - heads.at(-1)!.y > heads[0]!.y - lo;
    const far = up ? hi : lo;
    const marks = beamMarks({ x: stem.x1, far, up }, beams, space, full ? neighbors : undefined);
    const flag = glyphs.find(
      (g) =>
        code(g) >= 0xe240 && code(g) <= 0xe245 && close(g.x, stem.x1, space * 0.2) && close(g.y, far, space * 0.4),
    );
    const count = flag ? 1 + Math.floor((code(flag) - 0xe240) / 2) : marks.length;
    const value = code(heads[0]!) === 0xe0a3 ? 'half' : BEAM_VALUES[count];
    if (!value || heads.some((head) => code(head) !== code(heads[0]!))) return null;
    events.push({ x: Math.min(...heads.map((h) => h.x)), heads, up, value, beams: marks, triplet: false });
  }
  const restValues: NoteValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond'];
  for (const rest of glyphs.filter((g) => code(g) >= 0xe4e3 && code(g) <= 0xe4e8)) {
    events.push({
      x: rest.x,
      heads: [],
      up: false,
      rest,
      value: restValues[code(rest) - 0xe4e3]!,
      beams: [],
      triplet: false,
    });
  }
  if (full)
    for (const event of events) {
      const anchors = event.rest ? [event.rest] : event.heads;
      const dots = glyphs.filter(
        (g) =>
          code(g) === 0xe1e7 &&
          anchors.some((a) => g.x > a.x + space && g.x < a.x + space * 2.8 && Math.abs(g.y - a.y) < space * 0.75),
      );
      if (dots.length) event.dots = 1;
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
    // Multiple tuplets may share one continuous primary beam. The numeral sits
    // above or below the middle stem of its three-note group.
    const labels = geometry.glyphs.filter((g) => g.font.includes('Italic') && g.text === '3');
    for (const label of labels) {
      const middle = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.beams.length && e.heads.some((h) => Math.abs(h.y - label.y) < space * 8))
        .sort((a, b) => Math.abs(a.e.x + space * 0.6 - label.x) - Math.abs(b.e.x + space * 0.6 - label.x))[0];
      if (!middle || Math.abs(middle.e.x + space * 0.6 - label.x) > space * 1.3) continue;
      const run = events.slice(middle.i - 1, middle.i + 2);
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
  const voices = close(sum(events), bar.length, 0.001)
    ? [events]
    : [events.filter((e) => e.up), events.filter((e) => !e.up)];
  // Written accidentals apply across voices in their order on the page.
  const state = new Map<number, Alteration>();
  const unused = new Set(glyphs.filter((g) => code(g) >= 0xe260 && code(g) <= 0xe264));
  const pitches = new Map<PdfGlyph, Pick<WrittenNote, 'pitch' | 'accidental'>>();
  for (const event of events) {
    for (const head of event.heads) {
      const position = pitchAt(head.y, staff, changes.filter((c) => c.x < head.x).at(-1)?.clef ?? clef);
      if (!position) return false;
      const printed = [...unused].find(
        (g) => close(g.y, head.y, space * 0.18) && g.x < head.x && head.x - g.x < space * 2.6,
      );
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
    if (!close(sum(group), bar.length - (startBeat - bar.start), 0.001)) return false;
    let offset = startBeat - bar.start;
    const voice = String((number - 1) * 4 + v + 1);
    for (const event of group) {
      const beat = bar.start + offset;
      onsets.push({ beat, x: event.x, centeredRest: !!event.rest && event.span != null });
      ownColumns.push({ beat, x: event.x });
      const written = {
        value:
          event.rest && event.span
            ? ((Object.keys(BEATS) as NoteValue[]).find((v) => BEATS[v] === event.span) ?? event.value)
            : event.value,
        dots: event.dots ?? 0,
      } as const;
      if (event.rest) {
        // A down-voice quarter rest is anchored two staff spaces below its MusicXML display pitch.
        const displayY = event.rest.y + (event.up ? -2 : 2) * space;
        const defaultY = staff.bottom + (event.up ? 4 : 0) * space;
        const shifted =
          voices.length > 1 && (!full || !close(event.rest.y, defaultY, space * 0.2))
            ? pitchAt(displayY, staff, clef)
            : null;
        rests.push({
          staff: number,
          voice,
          beat,
          duration: written,
          measure: event.span != null,
          displayPitch: shifted,
          clef,
        });
      }
      for (const [i, head] of event.heads.entries()) {
        const { pitch, accidental } = pitches.get(head)!;
        const arpeggio = glyphs.some(
          (g) =>
            code(g) === 0xeaa9 &&
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
            clef: changes.filter((c) => c.x < head.x).at(-1)?.clef ?? clef,
            pitch,
            sounding: midiOf(pitch),
            beat,
            beats: duration(event),
            duration: written,
            tuplet: event.ratio ?? (event.triplet ? { actual: 3, normal: 2 } : null),
            tupletStart:
              (event.tupletFirst ?? (event.triplet && event.beams[0] === 'begin'))
                ? { showNumber: !event.ratio, bracket: false }
                : null,
            tupletStop: event.tupletLast ?? (event.triplet && event.beams[0] === 'end'),
            accidental,
            stem: event.up ? 'up' : 'down',
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
            ornaments: [],
            trillLine: false,
            tremolo: null,
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
