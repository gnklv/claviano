import type { Notation } from '../../../domain/notation/notation';
import type { PdfGeometry, PdfPoint } from './geometry';
import { systemsOf, type MuseScoreDirectionBar } from './museScoreDirections';
import { applyPdfCurves, centeredSlurEnd, insetChordSlur, isCurveRibbon } from './curves';

/** Match MuseScore's horizontally offset chord ties, including the two pieces
 * drawn when a sustained chord crosses to a different system or page. */
export function applyMuseScoreCurves(bars: readonly MuseScoreDirectionBar[], notation: Notation): Notation {
  const notes = [...notation.notes];
  const indexes = new Map(notes.map((n, i) => [n, i]));
  const heads = new Map(bars.flatMap((bar) => bar.notes.map((head) => [head.note, head] as const)));
  const continuations = new Map<string, number[]>();
  const tieKey = (n: (typeof notes)[number], beat: number) =>
    [n.staff, n.pitch.octave, n.pitch.letter, Math.round(beat * 1e6)].join('/');
  for (const [i, n] of notes.entries()) {
    const key = tieKey(n, n.beat);
    const candidates = continuations.get(key) ?? [];
    candidates.push(i);
    continuations.set(key, candidates);
  }
  const tiedFrom = new Map<number, number>();
  const pages = new Map<PdfGeometry, MuseScoreDirectionBar[]>();
  for (const bar of bars) {
    const page = pages.get(bar.geometry) ?? [];
    page.push(bar);
    pages.set(bar.geometry, page);
  }
  const consumed = new Set<PdfGeometry['curvedFills'][number]>();
  for (const [page, measures] of pages) {
    const placed = measures.flatMap((m) => m.notes);
    const space = measures[0]!.measure.staves[0].space;
    for (const contour of page.curvedFills) {
      const c = contour[0],
        back = contour[1];
      if (
        contour.length !== 2 ||
        !c ||
        !back ||
        Math.abs(c.from.y - c.to.y) > space * 0.06 ||
        Math.abs(c.from.x - back.to.x) > space * 0.02 ||
        Math.abs(c.to.x - back.from.x) > space * 0.02
      )
        continue;
      const [left, right] = c.from.x < c.to.x ? [c.from, c.to] : [c.to, c.from];
      const side = Math.sign(c.control1.y - left.y);
      const starts = placed.filter((n) => {
        const dx = (left.x - (n.columnX ?? n.x)) / space,
          dy = (left.y - n.y) * side / space;
        return dx > 0.2 && dx < 2.65 && dy > -0.35 && dy < 0.98;
      });
      for (const start of starts) {
        const i = indexes.get(start.note)!;
        const next = continuations.get(tieKey(start.note, start.note.beat + start.note.beats)) ?? [];
        for (const j of next) {
          const target = notation.notes[j]!;
          // In a polyphonic passage the continuation can move to another voice.
          if ((next.length > 1 && start.note.voice !== target.voice)
            || (target.accidental && target.sounding !== start.note.sounding)) continue;
          const dest = bars[target.bar]!,
            src = bars[start.note.bar]!;
          const head = heads.get(target)!;
          const sameSystem =
            src.geometry === dest.geometry &&
            Math.abs(dest.measure.staves[0].bottom - src.measure.staves[0].bottom) < 0.1;
          const endsAt = (point: PdfPoint) => {
            const column = head.columnX ?? head.x;
            const dy = (point.y - head.y) * side / space;
            return point.x > Math.min(column, head.x) - space && point.x < Math.max(column, head.x) + 0.85 * space
              && dy > -0.35 && dy < 0.98
              && (sameSystem || Math.abs(dy - (left.y - start.y) * side / space) < 0.50);
          };
          if (sameSystem) {
            // A grace slur can bridge the gap before a repeated pitch.
            // Its closing arc belongs to the ornament, not to the preceding full-size head.
            if (!endsAt(right) || insetChordSlur(c, start, head, space)) continue;
            if (centeredSlurEnd(right, head, space)) {
              const fromGrace = notation.graces.some(group =>
                group.leadsTo === j && group.notes.some(note => note.slur));
              if (fromGrace || centeredSlurEnd(left, start, space)) continue;
            }
          } else {
            if (Math.abs(right.x - src.measure.right) > space) continue;
            const continuation = dest.geometry.curvedFills.find(part => part.length === 2 && part[0]
              && Math.abs(part[0].from.y - part[0].to.y) < space * 0.06
              && (part[0].control1.y - part[0].from.y) * side > 0
              && endsAt(part[0].to) && part[0].from.x < head.x);
            if (!continuation) continue;
            consumed.add(continuation);
          }
          consumed.add(contour);
          tiedFrom.set(j, i);
          notes[i] = { ...notes[i]!, tieStart: true };
          notes[j] = { ...notes[j]!, tieStop: true };
        }
      }
    }
  }
  const slurs = systemSlurs(bars, consumed);
  for (const [page, measures] of pages) {
    const placed = measures.flatMap(m => m.notes);
    const space = measures[0]!.measure.staves[0].space;
    const remaining = { ...page, curvedFills: page.curvedFills.filter(c => !consumed.has(c)) };
    const recognized = applyPdfCurves(remaining, placed, space, true, (start, end, placement) => {
      slurs.push({ start, end, side: placement === 'above' ? 1 : -1 });
    });
    for (const [i, positioned] of placed.entries()) {
      const index = indexes.get(positioned.note);
      if (index != null)
        notes[index] = {
          ...notes[index]!,
          pitch: recognized[i]!.pitch,
          sounding: recognized[i]!.sounding,
          slurs: recognized[i]!.slurs,
          tieStart: notes[index]!.tieStart || recognized[i]!.tieStart,
          tieStop: notes[index]!.tieStop || recognized[i]!.tieStop,
        };
    }
  }
  // MusicXML numbers identify concurrent slurs. Reuse a number only after
  // its previous phrase has ended, including when two phrases share a head.
  const endsByStaff = new Map<number, number[]>();
  slurs.sort((a, b) => a.start.beat - b.start.beat || b.end.beat - a.end.beat);
  for (const { start, end, side } of slurs) {
    const ends = endsByStaff.get(start.staff) ?? [];
    endsByStaff.set(start.staff, ends);
    const free = ends.findIndex(beat => beat <= start.beat);
    const slot = free < 0 ? ends.length : free;
    ends[slot] = end.beat;
    const number = slot + 1;
    const i = indexes.get(start)!, j = indexes.get(end)!;
    notes[i] = { ...notes[i]!, slurs: [...notes[i]!.slurs, { type: 'start', number, placement: side > 0 ? 'above' : 'below' }] };
    notes[j] = { ...notes[j]!, slurs: [...notes[j]!.slurs, { type: 'stop', number, placement: null }] };
  }
  for (const [j, i] of [...tiedFrom].sort(([a], [b]) => notes[a]!.beat - notes[b]!.beat)) {
    notes[j] = { ...notes[j]!, pitch: notes[i]!.pitch, sounding: notes[i]!.sounding };
  }
  return { ...notation, notes };
}

type Contour = PdfGeometry['curvedFills'][number];
type Head = MuseScoreDirectionBar['notes'][number];

function archSide(contour: Contour, space: number): number {
  if (!isCurveRibbon(contour, space)) return 0;
  const { from, to, control1, control2 } = contour[0]!;
  if (to.x <= from.x) return 0;
  const slope = (to.y - from.y) / (to.x - from.x);
  const bend = (p: PdfPoint) => Math.sign(p.y - from.y - (p.x - from.x) * slope);
  return bend(control1) === bend(control2) ? bend(control1) : 0;
}

// A slur attaches near the head center or to the side of its stem. Opposing
// stems distinguish voices that share the same pitch and rhythmic column.
function slurHead(heads: readonly Head[], point: PdfPoint, side: number, space: number, opening: boolean) {
  let best: Head | undefined, distance = Infinity;
  for (const head of heads) {
    const x = (point.x - head.x) / space, y = (point.y - head.y) * side / space;
    if (y < 0.35 || y > 6) continue;
    const atStem = head.note.stem === (side > 0 ? 'up' : 'down');
    const stemX = (side > 0 ? 1.25 : 0.05) + (opening ? 0.32 : -0.32);
    const cost = Math.min(
      Math.hypot((x - 0.65) * 2, y - 0.9),
      atStem ? Math.hypot((x - stemX) * 2, (y - 3.2) * 0.45) : Infinity,
    );
    if (cost < 1.45 && cost < distance) { best = head; distance = cost; }
  }
  return best;
}

function principal(heads: readonly Head[], head: Head) {
  return heads.find(h => !h.note.chord && h.note.beat === head.note.beat
    && h.note.voice === head.note.voice && h.note.staff === head.note.staff)?.note;
}

function systemSlurs(bars: readonly MuseScoreDirectionBar[], consumed: Set<Contour>) {
  const systems = systemsOf(bars);
  const slurs: { start: Head['note']; end: Head['note']; side: number }[] = [];
  for (const [i, previous] of systems.entries()) {
    const following = systems[i + 1];
    if (!following) continue;
    const outgoing = previous.at(-1)!, incoming = following[0]!;
    const fromHeads = previous.flatMap(b => b.notes), toHeads = following.flatMap(b => b.notes);
    const space = outgoing.measure.staves[0].space, nextSpace = incoming.measure.staves[0].space;
    if (!incoming.notes.length) continue;
    const firstColumn = Math.min(...incoming.notes.map(h => h.x));
    const candidates = [];
    for (const contour of outgoing.geometry.curvedFills) {
      const arc = contour[0], side = archSide(contour, space);
      if (!side || !arc || consumed.has(contour) || Math.abs(arc.to.x - outgoing.measure.right) > space * 0.65) continue;
      const source = slurHead(fromHeads, arc.from, side, space, true);
      if (!source) continue;
      const staff = source.note.staff - 1;
      const height = (arc.to.y - outgoing.measure.staves[staff]!.bottom) / space;
      const voice = toHeads.filter(h => h.note.staff === source.note.staff && h.note.voice === source.note.voice);
      for (const part of incoming.geometry.curvedFills) {
        const curve = part[0];
        if (!curve || part === contour || consumed.has(part) || archSide(part, nextSpace) !== side || curve.from.x < incoming.measure.left
          || curve.from.x >= firstColumn - nextSpace * 0.15) continue;
        const gap = Math.abs((curve.from.y - incoming.measure.staves[staff]!.bottom) / nextSpace - height);
        if (gap > 4) continue;
        const target = slurHead(voice, curve.to, side, nextSpace, false);
        if (target) candidates.push({ contour, part, source, target, gap, side });
      }
    }
    // Resolve both ends across the whole break. A weaker match must not
    // claim the only good continuation of another phrase painted later.
    for (const edge of candidates.sort((a, b) => a.gap - b.gap)) {
      if (consumed.has(edge.contour) || consumed.has(edge.part)) continue;
      const ambiguous = candidates.some(other => Math.abs(other.gap - edge.gap) < 0.02
        && (other.contour === edge.contour && other.target !== edge.target
          || other.part === edge.part && other.source !== edge.source));
      if (ambiguous) continue;
      const start = principal(fromHeads, edge.source), end = principal(toHeads, edge.target);
      if (!start || !end) continue;
      consumed.add(edge.contour);
      consumed.add(edge.part);
      slurs.push({ start, end, side: edge.side });
    }
  }
  return slurs;
}
