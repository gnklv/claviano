import { durationBeats, type WrittenDuration } from '../../../domain/notation/noteValue';
import type { BeamMark } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import {
  BEAM_VALUES, DOT, HALF, WHOLE, beamMarks, codePoint, isHead, within, type BeamStrip, type Staff, type Stem,
} from './pianoGeometry';

export interface MuseScoreAttack {
  x: number;
  heads: PdfGlyph[];
  stem?: Stem;
  duration: WrittenDuration;
  beats: number;
  beams: BeamMark[];
  rest?: PdfGlyph;
  hiddenHead?: PdfGlyph;
  tremolo?: { type: 'start' | 'stop'; strokes: number };
}

interface Attachment {
  stem: Stem;
  anchor: PdfGlyph;
  heads: PdfGlyph[];
}

/** The stem base identifies the outer note of a chord. A second can displace
 * the next head to the other side of the same stem. */
function attachHeads(heads: PdfGlyph[], segments: PdfSegment[], space: number): Attachment[] {
  const attachments: Attachment[] = [];
  for (const line of segments) {
    if (!within(line.x1, line.x2, space * 0.02) || Math.abs(line.y2 - line.y1) < space * 1.25) continue;
    for (const up of [true, false]) {
      const sign = up ? 1 : -1;
      const near = up ? Math.min(line.y1, line.y2) : Math.max(line.y1, line.y2);
      const far = up ? Math.max(line.y1, line.y2) : Math.min(line.y1, line.y2);
      const normalX = line.x1 - space * (up ? 1.24 : 0.055);
      const oppositeX = line.x1 - space * (up ? 0.055 : 1.24);
      const column = heads.filter(head => within(head.x, normalX, space * 0.17));
      const anchor = column.find(head => within(head.y, near - sign * space * 0.16, space * 0.23));
      if (!anchor) continue;
      const members = heads.filter(head => {
        const displaced = within(head.x, oppositeX, space * 0.17)
          && column.some(neighbor => within(Math.abs(head.y - neighbor.y), space * 0.5, space * 0.1));
        return (column.includes(head) || displaced)
          && (head.y - anchor.y) * sign >= -space * 0.08 && (far - head.y) * sign > space * 0.5;
      });
      attachments.push({ stem: { x: line.x1, up, far }, anchor, heads: members });
    }
  }
  return attachments;
}

/** Require a beam to connect to a stem of this voice. Parallel beams belonging
 * to the other staff can pass immediately beyond the tip of a long stem. */
function attachedBeams(stem: Stem, beams: BeamStrip[], neighbors: Stem[], space: number): BeamMark[] {
  const depth = (beam: BeamStrip, at: Stem) => (at.far - beam.yAt(at.x)) * (at.up ? 1 : -1) / space;
  const connected = beams.filter(beam => depth(beam, stem) >= -0.3 && neighbors.some(other =>
    (within(other.x, beam.left, space * 0.14) || within(other.x, beam.right, space * 0.14))
    && depth(beam, other) >= -0.3 && depth(beam, other) < 1.8));
  return beamMarks(stem, connected, space, neighbors);
}

/** Paired tremolo strokes stop short of both stems. Each of the two nominal
 * values occupies half its printed duration. */
function applyTremolos(attacks: MuseScoreAttack[], beams: BeamStrip[], space: number): void {
  const ordered = attacks.filter(attack => attack.stem).sort((a, b) => a.x - b.x);
  for (let i = 1; i < ordered.length; i++) {
    const first = ordered[i - 1]!, second = ordered[i]!;
    const a = first.stem!, b = second.stem!;
    if (a.up !== b.up || first.tremolo || first.duration.value !== second.duration.value
      || first.beams.length || second.beams.length) continue;
    const strokes = beams.filter(strip => within(strip.left - a.x, space * 0.95, space * 0.15)
      && within(b.x - strip.right, space * 0.95, space * 0.15)
      && Math.abs(strip.yAt(a.x) - a.far) < space * 2.2);
    if (!strokes.length || strokes.length > 4) continue;
    first.beats /= 2;
    second.beats /= 2;
    first.tremolo = { type: 'start', strokes: strokes.length };
    second.tremolo = { type: 'stop', strokes: strokes.length };
  }
}

export function museScoreAttacks(
  geometry: PdfGeometry, glyphs: PdfGlyph[], staff: Staff, beams: BeamStrip[], length: number,
): MuseScoreAttack[] | null {
  const heads = glyphs.filter(isHead);
  const space = staff.space;
  const attachments = attachHeads(heads, geometry.segments, space);
  const output: MuseScoreAttack[] = [];
  const dots = glyphs.filter(g => codePoint(g) === DOT);
  for (const { stem, heads: members, anchor } of attachments) {
    const neighbors = attachments.map(a => a.stem).filter(s => s.up === stem.up);
    const marks = attachedBeams(stem, beams, neighbors, space);
    const flag = glyphs.find(g => codePoint(g) >= 0xe240 && codePoint(g) <= 0xe245
      && within(g.x, stem.x, space * 0.2) && within(g.y, stem.far, space * 0.35));
    const levels = marks.length || (flag ? 1 + Math.floor((codePoint(flag) - 0xe240) / 2) : 0);
    const shared = levels > 0 && attachments.some(a => a.stem !== stem && a.heads.includes(anchor));
    const chord = shared ? [anchor] : members;
    const value = codePoint(anchor) === HALF && !shared ? 'half' : BEAM_VALUES[levels];
    if (!value) return null;
    const right = Math.max(...chord.map(h => h.x));
    const dotted = !shared && dots.some(d => d.x - right > space * 1.3 && d.x - right < space * 2.35
      && chord.some(h => within(d.y, h.y, space * 0.55)));
    const duration: WrittenDuration = { value, dots: dotted ? 1 : 0 };
    output.push({ x: anchor.x, heads: chord, stem, duration, beats: durationBeats(duration),
      beams: value === 'half' ? [] : marks, ...(shared ? { hiddenHead: anchor } : {}) });
  }
  for (const head of heads.filter(h => !output.some(a => a.heads.includes(h)))) {
    if (codePoint(head) !== WHOLE) return null;
    const chord = output.find(a => !a.stem && within(a.x, head.x, space * 0.15));
    if (chord) chord.heads.push(head);
    else output.push({ x: head.x, heads: [head], duration: { value: 'whole', dots: 0 }, beats: 4, beams: [] });
  }
  const restValues = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond'] as const;
  for (const rest of glyphs) {
    const value = restValues[codePoint(rest) - 0xe4e3];
    if (!value) continue;
    const dotted = dots.some(d => d.x > rest.x + space * 0.9 && d.x < rest.x + space * 2
      && within(rest.y, d.y, space * 0.55));
    const duration: WrittenDuration = { value, dots: dotted ? 1 : 0 };
    output.push({ x: rest.x, heads: [], rest, duration, beams: [],
      beats: value === 'whole' && !heads.length ? length : durationBeats(duration) });
  }
  applyTremolos(output, beams, space);
  return output.sort((a, b) => a.x - b.x || a.beats - b.beats);
}
