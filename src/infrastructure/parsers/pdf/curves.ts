import type { SlurMark, WrittenNote } from '../../../domain/notation/written';
import type { PdfCubicBezier, PdfGeometry, PdfPoint } from './geometry';

interface PositionedNote extends PdfPoint {
  readonly note: WrittenNote;
}

function near(a: PdfPoint, b: PdfPoint, tolerance: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

/** Two reverse Beziers bound the narrow, filled ribbon of a tie or slur. */
export function isCurveRibbon(contour: readonly PdfCubicBezier[], space: number): boolean {
  const [forward, reverse] = contour;
  return contour.length === 2 && !!forward && !!reverse
    && near(forward.from, reverse.to, space * 0.02)
    && near(forward.to, reverse.from, space * 0.02)
    && near(forward.control1, reverse.control2, space * 0.35)
    && near(forward.control2, reverse.control1, space * 0.35);
}

/** MuseScore anchors ordinary phrasing slurs at the center of the head,
 * about 0.9 spaces above or below it. This also applies to repeated notes. */
export function centeredSlurEnd(point: PdfPoint, head: PdfPoint, space: number): boolean {
  return Math.abs((point.x - head.x) / space - 0.65) < 0.08
    && Math.abs(Math.abs(point.y - head.y) / space - 0.9) < 0.06;
}

/** A slur routed between adjacent chord heads can be displaced from the
 * typical center anchor. Both ends sit inside the head and the arch is deep. */
export function insetChordSlur(curve: PdfCubicBezier, start: PositionedNote, end: PositionedNote, space: number): boolean {
  return start.note.chord && end.note.chord
    && Math.abs((curve.from.x - start.x) / space - 1.15) < 0.1
    && Math.abs((curve.to.x - end.x) / space - 0.45) < 0.1
    && Math.abs(curve.from.y - start.y) < space * 0.36
    && Math.abs(curve.to.y - end.y) < space * 0.36
    && Math.abs(curve.control1.y - curve.from.y) > space * 1.65;
}

function atEnd(
  point: PdfPoint,
  notes: readonly PositionedNote[],
  placement: SlurMark['placement'],
  space: number,
): number {
  let best = -1;
  let distance = Infinity;
  for (const [index, note] of notes.entries()) {
    // The PDF positions the glyph at its left edge. Curves aim at the middle of the head.
    const dx = Math.abs(point.x - note.x - space * 0.63);
    const dy = (point.y - note.y) * (placement === 'above' ? 1 : -1);
    if (dx > space || dy < -space * 0.1 || dy > space * 1.6) continue;
    const score = dx * 1.5 + Math.abs(dy);
    if (score < distance) {
      distance = score;
      best = index;
    }
  }
  return best;
}

// An engraver may move the opening of a long phrase over a sustained chord.
// Use the occupied rhythmic span only when the curve ends on a known note,
// the next attack abuts the chord in this voice, and both are in this bar.
function heldSlurStart(point: PdfPoint, stop: PositionedNote, notes: readonly PositionedNote[], space: number, above: boolean): number {
  const voice = notes.filter(h => h.note.bar === stop.note.bar && h.note.staff === stop.note.staff
    && h.note.voice === stop.note.voice && h.note.beat <= stop.note.beat);
  const next = voice.filter(h => h.x > point.x).sort((a, b) => a.x - b.x)[0];
  if (!next) return -1;
  const source = voice.find(h => h.x + space * 2.2 < point.x
    && Math.abs(h.note.beat + h.note.beats - next.note.beat) < 1e-6
    && (point.y - h.y) * (above ? 1 : -1) > space * 0.4
    && (point.y - h.y) * (above ? 1 : -1) < space * 1.6);
  if (!source) return -1;
  // An intervening attack on the other staff supplies a printed time column
  // inside that sustain. Without one, an orphan arc can belong to a grace.
  const inside = notes.some(h => h.note.bar === source.note.bar && h.note.staff !== source.note.staff
    && h.note.beat > source.note.beat && h.note.beat < next.note.beat
    && h.x > source.x && h.x <= point.x);
  return inside ? notes.indexOf(source) : -1;
}

/** Recognize complete tie and slur contours within the extracted measures. */
export function applyPdfCurves(
  geometry: PdfGeometry,
  notes: readonly PositionedNote[],
  space: number,
  museScore = false,
  recordSlur?: (start: WrittenNote, end: WrittenNote, placement: 'above' | 'below') => void,
): WrittenNote[] {
  const written = notes.map((entry) => entry.note);
  const stems = geometry.segments.filter(
    (s) =>
      Math.abs(s.x1 - s.x2) < 0.02 && Math.abs(s.y1 - s.y2) > space * 1.8 && Math.abs(s.y1 - s.y2) < space * 12,
  );
  function atMuseScoreEnd(p: PdfPoint, placement: SlurMark['placement']): number {
    let best = -1,
      distance = Infinity;
    for (const [i, n] of notes.entries()) {
      const dx = (p.x - n.x) / space;
      if (dx < -0.65 || dx > 2.2) continue;
      const side = placement === 'above' ? 1 : -1;
      const dy = ((p.y - n.y) / space) * side;
      let score = dy > -0.05 && dy < 3.5 ? Math.hypot((dx - 0.65) * 1.4, dy - 0.88) : Infinity;
      if (side > 0 === (n.note.stem === 'up')) {
        const sx = n.note.stem === 'up' ? 1.25 : 0.05;
        for (const stem of stems) {
          if (
            Math.abs(stem.x1 - n.x - space * sx) > space * 0.16 ||
            n.y < Math.min(stem.y1, stem.y2) - space * 0.24 ||
            n.y > Math.max(stem.y1, stem.y2) + space * 0.24
          )
            continue;
          const far = side > 0 ? Math.max(stem.y1, stem.y2) : Math.min(stem.y1, stem.y2);
          const gap = ((p.y - far) / space) * side;
          if (gap >= -0.4 && gap <= 1.8) score = Math.min(score, Math.hypot((dx - sx) * 1.4, gap - 0.55) + 0.25);
        }
      }
      if (score < distance) {
        best = i;
        distance = score;
      }
    }
    return best;
  }
  let nextSlur = 1;
  for (const contour of geometry.curvedFills) {
    if (!isCurveRibbon(contour, space)) continue;
    const forward = contour[0]!;
    const { from, to, control1, control2 } = forward;
    const width = Math.abs(to.x - from.x);
    if (width < space) continue;
    const dx = to.x - from.x;
    const lineY = (x: number) => from.y + ((to.y - from.y) * (x - from.x)) / dx;
    const bend1 = control1.y - lineY(control1.x);
    const bend2 = control2.y - lineY(control2.x);
    if (Math.abs(bend1) < space * 0.1 || Math.abs(bend2) < space * 0.1 || bend1 * bend2 < 0) continue;
    const placement = bend1 > 0 ? 'above' : 'below';
    const [left, right] = dx > 0 ? [from, to] : [to, from];
    let startIndex = atEnd(left, notes, placement, space);
    let stopIndex = atEnd(right, notes, placement, space);
    let phrasingSlur = museScore && notes[startIndex] && notes[stopIndex]
      && (centeredSlurEnd(left, notes[startIndex]!, space) && centeredSlurEnd(right, notes[stopIndex]!, space)
        || insetChordSlur(forward, notes[startIndex]!, notes[stopIndex]!, space));
    if (museScore) {
      // Ties attach directly to their individual heads. Slurs can attach to
      // a beam or stem tip and are written on the first note of the chord.
      const a = written[startIndex],
        b = written[stopIndex];
      // A tied note crossing a barline keeps the previous alteration without
      // a new accidental. Require horizontally level endpoints on adjacent
      // notes of the same written pitch, voice and staff.
      if (!phrasingSlur && a && b && a.bar + 1 === b.bar && a.voice === b.voice && a.staff === b.staff
        && a.pitch.letter === b.pitch.letter && a.pitch.octave === b.pitch.octave
        && !b.accidental && a.sounding !== b.sounding
        && Math.abs(a.beat + a.beats - b.beat) < 0.001 && Math.abs(from.y - to.y) < space * 0.1) {
        written[stopIndex] = { ...b, pitch: a.pitch, sounding: a.sounding };
      }
      const directTie =
        !phrasingSlur && a &&
        b &&
        a.sounding === written[stopIndex]!.sounding &&
        a.voice === b.voice &&
        Math.abs(a.beat + a.beats - b.beat) < 0.001 &&
        Math.abs(from.y - to.y) < space * 0.1;
      if (!directTie) {
        startIndex = atMuseScoreEnd(left, placement);
        stopIndex = atMuseScoreEnd(right, placement);
        if (stopIndex >= 0 && (startIndex < 0 || written[startIndex]!.staff !== written[stopIndex]!.staff)) {
          startIndex = heldSlurStart(left, notes[stopIndex]!, notes, space, placement === 'above');
          if (startIndex >= 0) phrasingSlur = true;
        }
        while (written[startIndex]?.chord) startIndex--;
        while (written[stopIndex]?.chord) stopIndex--;
      }
    }
    const start = written[startIndex];
    const stop = written[stopIndex];
    if (!start || !stop || start.staff !== stop.staff || start.beat >= stop.beat) continue;
    const tie =
      !phrasingSlur && start.sounding === stop.sounding &&
      start.voice === stop.voice &&
      Math.abs(start.beat + start.beats - stop.beat) < 0.001 &&
      Math.abs(from.y - to.y) < space * 0.1;
    if (tie) {
      written[startIndex] = { ...start, tieStart: true };
      written[stopIndex] = { ...stop, tieStop: true };
    } else if (recordSlur) {
      recordSlur(notes[startIndex]!.note, notes[stopIndex]!.note, placement);
    } else {
      const number = museScore ? 1 : nextSlur++;
      written[startIndex] = { ...start, slurs: [...start.slurs, { type: 'start', number, placement }] };
      written[stopIndex] = { ...stop, slurs: [...stop.slurs, { type: 'stop', number, placement }] };
    }
  }
  return written;
}

/** A filled circular contour of augmentation-dot size, measured in staff spaces. */
export function roundDotCenter(contour: readonly PdfCubicBezier[], space: number): PdfPoint | null {
  if (contour.length < 4) return null;
  const points = contour.map((curve) => curve.from);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const left = Math.min(...xs),
    bottom = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - bottom;
  if (width < space * 0.3 || width > space * 0.5 || Math.abs(width - height) > space * 0.05) return null;
  const center = { x: left + width / 2, y: bottom + height / 2 };
  const radius = (width + height) / 4;
  if (
    !points.every((p) => Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius) < space * 0.025) ||
    !contour.every((curve, i) => near(curve.to, points[(i + 1) % points.length]!, space * 0.025))
  )
    return null;
  return center;
}
