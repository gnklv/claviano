import { midiOf } from '../../../domain/notation/spelling';
import type { WrittenNote } from '../../../domain/notation/written';
import { isCurveRibbon } from './curves';
import type { PdfCubicBezier, PdfGeometry, PdfPoint } from './geometry';
import type { LilyPondMeasure } from './lilyPondMeasures';
import type { TimedNote } from './pianoNotes';

interface TieBar {
  readonly geometry: PdfGeometry;
  readonly measure: LilyPondMeasure;
  readonly notes: readonly TimedNote[];
}

type Contour = PdfGeometry['curvedFills'][number];
interface Arc {
  readonly contour: Contour;
  readonly left: PdfPoint;
  readonly right: PdfPoint;
  readonly side: number;
  readonly shaped: boolean;
}

interface Match {
  readonly source: TimedNote;
  readonly target: TimedNote;
  readonly arc: Arc;
  readonly continuation?: Arc;
  readonly cost: number;
}

function tieArc(contour: Contour, space: number): Arc | undefined {
  if (!isCurveRibbon(contour, space)) return;
  const { from, to, control1, control2 } = contour[0]!;
  const [left, right] = from.x < to.x ? [from, to] : [to, from];
  const width = right.x - left.x;
  if (width < space * 0.4) {
    // At the right margin LilyPond can collapse a tie fragment to a point.
    // It supplies an anchor only when paired with a noncollapsed continuation.
    const collapsed = contour.every(curve => [curve.from, curve.to, curve.control1, curve.control2]
      .every(point => Math.abs(point.x - left.x) < space * 0.02 && Math.abs(point.y - left.y) < space * 0.12));
    return collapsed ? { contour, left, right, side: 0, shaped: false } : undefined;
  }
  const height = ((control1.y + control2.y) / 2 - left.y) / space;
  // LilyPond engraves level, symmetric ties. The documented default height
  // limit is one space. The ribbon's outline adds a small amount to that.
  const shaped = Math.abs(height) > 1.15;
  if (Math.abs(height) < 0.12 || Math.abs(height) > 3.5
    || Math.abs(from.y - to.y) > space * (shaped ? 0.2 : 0.06)
    || Math.abs(control1.y - control2.y) > space * (shaped ? 0.2 : 0.06)) return;
  const overhang = shaped ? space * 0.6 : 0;
  const monotone = ({ from, to, control1, control2 }: PdfCubicBezier) =>
    control1.x > left.x - overhang && control1.x < right.x + overhang
      && control2.x > left.x - overhang && control2.x < right.x + overhang
      && (control2.x - control1.x) * (to.x - from.x) > 0;
  if (!contour.every(monotone)) return;
  return { contour, left, right, side: Math.sign(height), shaped };
}

function anchor(head: TimedNote, point: PdfPoint, space: number, arc: Arc, opening: boolean): number {
  const x = (point.x - head.x) / space;
  const rawY = (point.y - head.y) / space;
  const y = arc.side ? rawY * arc.side : Math.abs(rawY);
  if (y < -0.12 || y > (arc.shaped ? 1.85 : 1.35)) return Infinity;
  // An outer tie may begin or end inside the oval to clear an opposing
  // stem. Accidentals and dots can instead push its tip away from the head.
  const whole = head.note.duration.value === 'whole';
  const printedWidth = whole ? 1.95 : 1.35;
  const leftLimit = head.note.accidental ? -3 : -1.15;
  if (opening ? x < (arc.shaped ? 0.25 : 0.55) || x > printedWidth + 1.4 : x < leftLimit || x > printedWidth * 0.65) return Infinity;
  const offset = opening ? Math.min(Math.abs(x - printedWidth - 0.2), Math.abs(x - printedWidth * 0.66))
    : Math.min(Math.abs(x + 0.2), Math.abs(x - 0.46));
  return offset * 0.55 + Math.abs(y - 0.45) * 0.4;
}

function positionKey(note: WrittenNote, beat: number): string {
  return [note.staff, note.pitch.letter, note.pitch.octave, Math.round(beat * 1e6)].join('/');
}

function unisonVoiceCost(head: TimedNote, unisons: readonly TimedNote[], side: number): number {
  const stem = side > 0 ? 'up' : 'down';
  return head.note.stem !== stem && unisons.some(other => other.note.stem === stem
    && other.x === head.x && other.y === head.y) ? 0.45 : 0;
}

function agrees(source: WrittenNote, target: WrittenNote): boolean {
  if (source.sounding === target.sounding) return true;
  return source.bar !== target.bar && !target.accidental
    && source.sounding - midiOf(source.pitch) === target.sounding - midiOf(target.pitch);
}

/** Match LilyPond tie ribbons to rhythmically adjacent pitches, including the
 * separate fragments drawn at opposite sides of a system or page break. */
export function applyLilyPondTies(bars: readonly TieBar[]): WrittenNote[] {
  const heads = bars.flatMap(bar => bar.notes);
  const indexes = new Map(heads.map((head, i) => [head, i]));
  const notes = heads.map(head => head.note);
  const systems: TieBar[][] = [];
  for (const bar of bars) {
    const current = systems.at(-1);
    if (!current || bar.measure.systemStart || current[0]!.geometry !== bar.geometry) systems.push([bar]);
    else current.push(bar);
  }
  const byBeat = new Map<string, TimedNote[]>();
  for (const head of heads) {
    const key = positionKey(head.note, head.note.beat);
    const previous = byBeat.get(key) ?? [];
    previous.push(head);
    byBeat.set(key, previous);
  }
  const arcsByPage = new Map<PdfGeometry, Arc[]>();
  const arcs = (bar: TieBar) => {
    const cached = arcsByPage.get(bar.geometry);
    if (cached) return cached;
    const page = bar.geometry.curvedFills.flatMap(contour => {
      const arc = tieArc(contour, bar.measure.staves[0]!.space);
      return arc ? [arc] : [];
    });
    arcsByPage.set(bar.geometry, page);
    return page;
  };
  const matches: Match[] = [];
  for (const [i, system] of systems.entries()) {
    const first = system[0]!, last = system.at(-1)!;
    const next = systems[i + 1]?.[0];
    const nextNotes = new Set(next?.notes);
    const systemNotes = system.flatMap(bar => bar.notes);
    const local = new Set(systemNotes);
    const space = first.measure.staves[0]!.space;
    const nextSpace = next?.measure.staves[0]!.space ?? space;
    for (const arc of arcs(first)) {
      for (const source of systemNotes) {
        const startCost = anchor(source, arc.left, space, arc, true);
        if (!Number.isFinite(startCost)) continue;
        const targets = byBeat.get(positionKey(source.note, source.note.beat + source.note.beats)) ?? [];
        for (const target of targets) {
          if (!agrees(source.note, target.note)) continue;
          let voiceCost = source.note.voice === target.note.voice ? 0 : 0.45;
          const sources = byBeat.get(positionKey(source.note, source.note.beat)) ?? [];
          voiceCost += unisonVoiceCost(source, sources, arc.side) + unisonVoiceCost(target, targets, arc.side);
          // A phrasing slur can also be level across repeated pitches,
          // but its tips attach at equivalent positions on both heads.
          const inset = (arc.left.x - source.x) - (arc.right.x - target.x);
          const shapedWhole = arc.shaped && source.note.duration.value === 'whole'
            && source.note.bar !== target.note.bar && Math.abs(source.y - target.y) < space * 0.06;
          if (arc.side && local.has(target) && source.x < target.x
            && (shapedWhole && inset >= -space * 0.15 || !arc.shaped && inset >= space * 0.2)) {
            const cost = startCost + anchor(target, arc.right, space, arc, false) + voiceCost;
            if (Number.isFinite(cost)) matches.push({ source, target, arc, cost });
          }
          if (arc.shaped || !next || !nextNotes.has(target) || !last.notes.includes(source)
            || Math.abs(arc.right.x - last.measure.right) > space * 0.8) continue;
          for (const continuation of arcs(next)) {
            if (continuation === arc || continuation.shaped || !continuation.side || (arc.side && continuation.side !== arc.side)
              || continuation.left.x < next.measure.left - nextSpace * 0.15
              || continuation.left.x >= target.x - nextSpace * 0.2) continue;
            const shift = Math.abs((arc.left.y - source.y) / space - (continuation.right.y - target.y) / nextSpace);
            if (shift > (arc.side ? 0.75 : 0.15)) continue;
            const cost = startCost + anchor(target, continuation.right, nextSpace, continuation, false) + shift + voiceCost;
            if (Number.isFinite(cost)) matches.push({ source, target, arc, continuation, cost });
          }
        }
      }
    }
  }

  const outgoing = new Set<TimedNote>(), incoming = new Set<TimedNote>(), consumed = new Set<Contour>();
  const ties: Match[] = [];
  for (const match of matches.sort((a, b) => a.cost - b.cost)) {
    const { source, target, arc, continuation } = match;
    if (outgoing.has(source) || incoming.has(target) || consumed.has(arc.contour)
      || continuation && consumed.has(continuation.contour)) continue;
    // Indistinguishable unisons with the same voice evidence are ambiguous.
    const ambiguous = matches.some(other => other !== match && !outgoing.has(other.source) && !incoming.has(other.target)
      && !consumed.has(other.arc.contour) && !(other.continuation && consumed.has(other.continuation.contour))
      && Math.abs(other.cost - match.cost) < 0.015 && (other.arc === arc || continuation && other.continuation === continuation)
      && (other.source !== source || other.target !== target));
    if (ambiguous) continue;
    consumed.add(arc.contour);
    if (continuation) consumed.add(continuation.contour);
    outgoing.add(source);
    incoming.add(target);
    ties.push(match);
  }
  for (const { source, target } of ties.sort((a, b) => a.source.note.beat - b.source.note.beat)) {
    const i = indexes.get(source)!, j = indexes.get(target)!;
    const start = notes[i]!;
    if (!agrees(start, notes[j]!)) continue;
    notes[i] = { ...start, tieStart: true };
    notes[j] = { ...notes[j]!, pitch: start.pitch, sounding: start.sounding, tieStop: true };
  }
  return notes;
}
