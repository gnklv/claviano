import type { Notation } from '../../../domain/notation/notation';
import type { PdfGeometry, PdfPoint } from './geometry';
import type { MuseScoreDirectionBar } from './museScoreDirections';
import { applyPdfCurves } from './curves';

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
  for (const [page, measures] of pages) {
    const placed = measures.flatMap((m) => m.notes);
    const recognized = applyPdfCurves(page, placed, measures[0]!.measure.staves[0].space, true);
    for (const [i, positioned] of placed.entries()) {
      const index = indexes.get(positioned.note);
      if (index != null)
        notes[index] = {
          ...notes[index]!,
          slurs: recognized[i]!.slurs,
          tieStart: notes[index]!.tieStart || recognized[i]!.tieStart,
          tieStop: notes[index]!.tieStop || recognized[i]!.tieStop,
        };
    }
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
      const starts = placed.filter((n) => {
        const dx = (left.x - (n.columnX ?? n.x)) / space,
          dy = Math.abs(left.y - n.y) / space;
        return dx > 1.2 && dx < 2.65 && dy < 0.4;
      });
      for (const start of starts) {
        const i = indexes.get(start.note)!;
        const next = continuations.get(tieKey(start.note, start.note.beat + start.note.beats)) ?? [];
        for (const j of next) {
          const target = notation.notes[j]!;
          const dest = bars[target.bar]!,
            src = bars[start.note.bar]!;
          const head = heads.get(target)!;
          const sameSystem =
            src.geometry === dest.geometry &&
            Math.abs(dest.measure.staves[0].bottom - src.measure.staves[0].bottom) < 0.1;
          const endsAt = (point: PdfPoint) =>
            Math.abs(point.y - head.y) < space * 0.4 && Math.abs(point.x - head.x) < space * 0.45;
          if (
            sameSystem
              ? !endsAt(right)
              : Math.abs(right.x - src.measure.right) > space ||
                !dest.geometry.curvedFills.some(
                  (c) => c.length === 2 && c[0] && endsAt(c[0].to) && c[0].from.x < head.x,
                )
          )
            continue;
          tiedFrom.set(j, i);
          notes[i] = { ...notes[i]!, tieStart: true };
          notes[j] = { ...notes[j]!, tieStop: true };
        }
      }
    }
  }
  for (const bar of bars) {
    const next = bars[bar.index + 1];
    if (!next || (next.geometry === bar.geometry && next.measure.staves[0].bottom === bar.measure.staves[0].bottom))
      continue;
    const space = bar.measure.staves[0].space;
    for (const c of bar.geometry.curvedFills) {
      const arc = c[0];
      if (
        c.length !== 2 ||
        !arc ||
        Math.abs(arc.to.x - bar.measure.right) > space * 0.65 ||
        Math.abs(arc.to.y - arc.from.y) < space * 0.6
      )
        continue;
      const origins = bar.notes.filter(
        (n) =>
          Math.abs(arc.from.x - n.x - space * 0.65) < space * 0.3 &&
          Math.abs(Math.abs(arc.from.y - n.y) - space * 0.9) < space * 0.3,
      );
      if (origins.length !== 1) continue;
      const origin = origins[0]!,
        first = next.notes.find((n) => n.note.staff === origin.note.staff && n.note.voice === origin.note.voice);
      if (!first) continue;
      // Continuation starts in the system header and ends on the first chord
      // or its stem. Require a second drawn arc on that same staff.
      const staff = next.measure.staves[first.note.staff - 1]!;
      const continuation = next.geometry.curvedFills.some((c) => {
        const part = c[0];
        return (
          c.length === 2 &&
          part &&
          part.from.x < first.x - space &&
          Math.abs(part.to.x - first.x - space * 0.65) < space * 0.5 &&
          Math.abs(part.to.y - (staff.bottom + space * 2)) < space * 7
        );
      });
      if (!continuation) continue;
      const i = indexes.get(origin.note)!,
        j = indexes.get(first.note)!;
      const placement = arc.from.y > origin.y ? 'above' : 'below';
      notes[i] = { ...notes[i]!, slurs: [...notes[i]!.slurs, { type: 'start', number: 1, placement }] };
      notes[j] = { ...notes[j]!, slurs: [...notes[j]!.slurs, { type: 'stop', number: 1, placement: null }] };
    }
  }
  for (const [j, i] of [...tiedFrom].sort(([a], [b]) => notes[a]!.beat - notes[b]!.beat)) {
    notes[j] = { ...notes[j]!, pitch: notes[i]!.pitch, sounding: notes[i]!.sounding };
  }
  return { ...notation, notes };
}
