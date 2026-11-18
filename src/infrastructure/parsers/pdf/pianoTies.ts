import type { WrittenBar } from '../../../domain/notation/notation';
import type { WrittenNote } from '../../../domain/notation/written';
import type { PdfCubicBezier, PdfPoint } from './geometry';
import { within, type Measure } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

type Contour = readonly PdfCubicBezier[];

interface OpenTie {
  readonly contour: Contour;
  readonly start: WrittenNote;
}

interface OpenSlur {
  readonly destination: Measure;
  readonly side: number;
  readonly start: WrittenNote;
}

export type PendingTie = OpenTie | OpenSlur;

/** The two edges of an engraved slur bow to the same side of its inclined chord. */
export function slurArc(contour: Contour, space: number) {
  if (contour.length !== 2) return null;
  const [a, b] = contour;
  if (!a || !b) return null;
  const close = (p: PdfPoint, q: PdfPoint, radius: number) =>
    Math.hypot(p.x - q.x, p.y - q.y) <= radius * space;
  if (!close(a.from, b.to, 0.02) || !close(b.from, a.to, 0.02)
    || !close(a.control1, b.control2, 0.55) || !close(b.control1, a.control2, 0.55)) return null;
  const [left, right] = a.from.x < a.to.x ? [a.from, a.to] : [a.to, a.from];
  const width = right.x - left.x;
  if (width < space) return null;
  const offset = (p: PdfPoint) => p.y - left.y - (p.x - left.x) * (right.y - left.y) / width;
  const side = Math.sign(offset(a.control1));
  for (const edge of contour) {
    if ((edge.control2.x - edge.control1.x) * (edge.to.x - edge.from.x) <= 0) return null;
    for (const p of [edge.control1, edge.control2]) {
      if (p.x < left.x - space * 0.12 || p.x > right.x + space * 0.12
        || offset(p) * side < space * 0.25) return null;
    }
  }
  return { left, right, side };
}

function tieArc(contour: Contour, space: number) {
  const [a, b] = contour;
  if (contour.length !== 2 || !a || !b) return null;
  const close = (p: PdfPoint, q: PdfPoint, tolerance: number) =>
    Math.hypot(p.x - q.x, p.y - q.y) <= space * tolerance;
  if (!close(a.from, b.to, 0.02) || !close(a.to, b.from, 0.02)
    || !close(a.control1, b.control2, 0.35) || !close(a.control2, b.control1, 0.35)) return null;
  const [left, right] = a.from.x < a.to.x ? [a.from, a.to] : [a.to, a.from];
  if (right.x - left.x < space || !within(left.y, right.y, space * 0.06)) return null;
  const side = Math.sign(a.control1.y - left.y);
  for (const edge of contour) {
    for (const p of [edge.control1, edge.control2]) {
      if (p.x <= left.x || p.x >= right.x || (p.y - left.y) * side < space * 0.12) return null;
    }
    if ((edge.control2.x - edge.control1.x) * (edge.to.x - edge.from.x) <= 0) return null;
  }
  return { left, right, side };
}

function consecutive(a: WrittenNote, b: WrittenNote): boolean {
  return a.staff === b.staff && a.voice === b.voice && a.sounding === b.sounding
    && a.pitch.letter === b.pitch.letter && a.pitch.octave === b.pitch.octave
    && within(a.beat + a.beats, b.beat, 0.001);
}

function readSlur(contour: Contour, measure: Measure, bar: WrittenBar, positioned: readonly TimedNote[],
  notes: WrittenNote[], incoming: Set<OpenSlur>, pending: PendingTie[], next?: Measure,
): boolean {
  const space = measure.staves[0].space;
  const slur = slurArc(contour, space);
  if (!slur) return false;
  const anchors = (point: PdfPoint) => positioned.flatMap((entry, i) =>
    within(point.x, entry.x + 0.58 * space, 0.15 * space)
    && within(point.y, entry.y + slur.side * 1.12 * space, 0.15 * space) ? [i] : []);
  const starts = anchors(slur.left), stops = anchors(slur.right);
  if (starts.length > 1 || stops.length > 1) return false;
  const mark = (index: number, type: 'start' | 'stop') => {
    const note = notes[index]!;
    if (note.slurs.some(mark => mark.type === type)) return false;
    notes[index] = { ...note, slurs: [...note.slurs, { type, number: note.staff, placement: type === 'stop' ? null : slur.side > 0 ? 'above' : 'below' }] };
    return true;
  };
  const source = starts[0], target = stops[0];
  if (source === undefined) {
    if (target === undefined) return false;
    const end = notes[target]!;
    const candidates = [...incoming].filter(open => open.destination === measure && open.side === slur.side
      && open.start.staff === end.staff && open.start.voice === end.voice);
    // On the next system the short continuation starts just before its first note.
    if (candidates.length !== 1 || !within(end.beat, bar.start, 0.001)
      || !within(slur.left.x, positioned[target]!.x - space, space * 0.2)
      || !within(slur.left.y, slur.right.y + slur.side * space, space * 0.2) || !mark(target, 'stop')) return false;
    incoming.delete(candidates[0]!);
  } else {
    const start = notes[source]!;
    if (!mark(source, 'start')) return false;
    if (target === undefined) {
      if (!next || next.staves[0].bottom >= measure.staves[1].bottom
        || !within(slur.right.x, measure.right - space * 0.4, space * 0.15)
        || !within(slur.right.y, slur.left.y, space * 0.5)
        || pending.some(item => 'destination' in item && item.start.staff === start.staff)) return false;
      pending.push({ destination: next, side: slur.side, start });
    } else {
      const end = notes[target]!;
      if (start.staff !== end.staff || start.voice !== end.voice || start.beat >= end.beat
        || !mark(target, 'stop')) return false;
    }
  }
  return true;
}

/** Consume every non-dot contour. A curve crossing a barline or system break must be seen again
 * at its engraved end before the caller publishes the source bar. */
export function readBarTies(contours: readonly Contour[], measure: Measure, bar: WrittenBar,
  positioned: readonly TimedNote[], incoming: readonly PendingTie[], next?: Measure,
): { notes: WrittenNote[]; pending: PendingTie[] } | null {
  const notes = positioned.map(entry => entry.note);
  const pending: PendingTie[] = [];
  const waiting = new Map(incoming.filter((item): item is OpenTie => 'contour' in item)
    .map(tie => [tie.contour, tie.start]));
  const slurs = new Set(incoming.filter((item): item is OpenSlur => 'destination' in item));
  const space = measure.staves[0].space;
  for (const contour of contours) {
    const arc = tieArc(contour, space);
    if (!arc) {
      if (!readSlur(contour, measure, bar, positioned, notes, slurs, pending, next)) return null;
      continue;
    }
    const match = (point: PdfPoint, start: boolean) => {
      const matches = positioned.flatMap((entry, index) => {
        // Ties touch the right edge of the source and the left edge of the target.
        // The whole-note glyph is wider than the ordinary oval head.
        const dx = start ? (entry.note.duration.value === 'whole' ? 1.93 : 1.43) : -0.25;
        return within(point.x, entry.x + dx * space, space * 0.2)
          && within(point.y, entry.y + arc.side * space * 0.25, space * 0.12) ? [index] : [];
      });
      return matches.length === 1 ? matches[0] : undefined;
    };
    let start = waiting.get(contour);
    if (arc.left.x < measure.left) {
      if (!start) return null;
      waiting.delete(contour);
    } else {
      const index = match(arc.left, true);
      if (index === undefined || notes[index]!.tieStart || start) return null;
      start = notes[index] = { ...notes[index]!, tieStart: true };
    }
    if (arc.right.x > measure.right) {
      if (arc.left.x < measure.left || !within(start.beat + start.beats, bar.start + bar.length, 0.001)) return null;
      pending.push({ contour, start });
    } else {
      const index = match(arc.right, false);
      if (index === undefined || notes[index]!.tieStop || !consecutive(start, notes[index]!)) return null;
      notes[index] = { ...notes[index]!, tieStop: true };
    }
  }
  if (waiting.size || slurs.size) return null;
  // Staff-based numbering is unambiguous only for disjoint phrases. Validate
  // in musical order, independently of the order PDF paths were painted in.
  const active = new Set(incoming.filter((item): item is OpenSlur => 'destination' in item)
    .map(item => item.start.staff));
  const endpoints = notes.flatMap((note, index) => note.slurs
    .filter(mark => !positioned[index]!.note.slurs.includes(mark))
    .map(mark => ({ beat: note.beat, mark })))
    .sort((a, b) => a.beat - b.beat || Number(a.mark.type === 'start') - Number(b.mark.type === 'start'));
  for (const { mark } of endpoints) {
    if (mark.type === 'stop') {
      if (!active.delete(mark.number)) return null;
    } else {
      if (active.has(mark.number)) return null;
      active.add(mark.number);
    }
  }
  return { notes, pending };
}
