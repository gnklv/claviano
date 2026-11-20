import { durationBeats, type WrittenDuration } from '../../../domain/notation/noteValue';
import type { BeamMark } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import {
  BEAM_VALUES, DOT, HALF, WHOLE, beamMarks, codePoint, isHead, within, type BeamStrip, type Staff, type Stem,
} from './pianoGeometry';

export interface PianoAttack {
  x: number;
  heads: PdfGlyph[];
  stem?: Stem;
  duration: WrittenDuration;
  beats: number;
  beams: BeamMark[];
  rest?: PdfGlyph;
  hiddenHead?: PdfGlyph;
  tripletBracket?: boolean;
  triplet?: 'start' | 'continue' | 'stop';
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
export function attachedBeams(stem: Stem, beams: BeamStrip[], neighbors: Stem[], space: number): BeamMark[] {
  const depth = (beam: BeamStrip, at: Stem) => (at.far - beam.yAt(at.x)) * (at.up ? 1 : -1) / space;
  const connected = beams.filter(beam => depth(beam, stem) >= -0.3 && neighbors.some(other =>
    (within(other.x, beam.left, space * 0.14) || within(other.x, beam.right, space * 0.14))
    && depth(beam, other) >= -0.3 && depth(beam, other) < 1.8));
  return beamMarks(stem, connected, space, neighbors);
}

/** Paired tremolo strokes stop short of both stems. Each of the two nominal
 * values occupies half its printed duration. */
function applyTremolos(attacks: PianoAttack[], beams: BeamStrip[], space: number): void {
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

/** Each half of a MuseScore tuplet bracket terminates in a short vertical hook.
 * Quarter-note groups and groups ending in a rest can have sloping brackets. */
function bracketedTriplet(
  first: PianoAttack, last: PianoAttack, digit: PdfGlyph, segments: readonly PdfSegment[], space: number,
): boolean {
  const hook = (x: number, y: number) => segments.some(s =>
    within(s.x1, x, space * 0.05) && within(s.x2, x, space * 0.05)
    && (within(s.y1, y, space * 0.05) || within(s.y2, y, space * 0.05))
    && within(Math.abs(s.y2 - s.y1), space * 0.75, space * 0.25));
  const arms = segments.filter(s => Math.abs(s.x2 - s.x1) >= space
    && Math.abs(s.y2 - s.y1) < 0.4 * Math.abs(s.x2 - s.x1)
    && within((s.y1 + s.y2) / 2, digit.y, 1.8 * space))
    .map(s => s.x1 < s.x2 ? s : { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 });
  return arms.some(s => within(s.x1, first.x, space * 1.6) && within(s.x2, digit.x, space)
    && s.x2 < digit.x && hook(s.x1, s.y1))
    && arms.some(s => within(s.x2, last.x, space * 1.9) && s.x1 > digit.x
      && s.x1 < digit.x + space * 2.1 && hook(s.x2, s.y2));
}

function applyTriplets(attacks: PianoAttack[], geometry: PdfGeometry, space: number): void {
  const numbers = geometry.glyphs.filter(g => (g.text === '3' && /italic/i.test(g.font)) || codePoint(g) === 0xe883);
  for (let i = 0; i + 2 < attacks.length; i++) {
    const first = attacks[i]!, middle = attacks[i + 1]!, last = attacks[i + 2]!;
    if ((!first.stem && !first.rest) || (!middle.stem && !middle.rest) || first.beats !== middle.beats || last.beats !== middle.beats
      || first.triplet) continue;
    const beamed = first.beams[0] === 'begin' && middle.beams[0] === 'continue' && last.beams[0] === 'end';
    const midpoint = ((first.stem?.x ?? first.x) + (last.stem?.x ?? last.x)) / 2;
    const referenceY = middle.stem?.far ?? middle.rest!.y;
    const digits = numbers.filter(g => within(g.x + 0.5 * space, midpoint, space * 1.4)
      && within(g.y, referenceY, space * 5));
    const bracket = digits.some(digit => bracketedTriplet(first, last, digit, geometry.segments, space));
    if (!bracket && !(beamed && digits.some(g => within(g.y, referenceY, space * 4.5)))) continue;
    first.tripletBracket = bracket;
    first.triplet = 'start';
    middle.triplet = 'continue';
    last.triplet = 'stop';
    for (const attack of [first, middle, last]) attack.beats *= 2 / 3;
  }
}

export function readPianoAttacks(
  geometry: PdfGeometry, glyphs: PdfGlyph[], staff: Staff, beams: BeamStrip[], length: number,
): PianoAttack[] | null {
  const heads: PdfGlyph[] = [];
  const doubled = new Map<PdfGlyph, PdfGlyph>();
  // Opposite stems may have two copies of the same printed head. Reserve one
  // copy per voice when both stems use the head.
  for (const glyph of glyphs.filter(isHead)) {
    const twin = heads.find(head => head.x === glyph.x && head.y === glyph.y
      && head.text === glyph.text && head.size === glyph.size && head.font === glyph.font);
    if (twin) doubled.set(twin, glyph);
    else heads.push(glyph);
  }
  const space = staff.space;
  const attachments = attachHeads(heads, geometry.segments, space);
  const output: PianoAttack[] = [];
  const dots = glyphs.filter(g => codePoint(g) === DOT);
  for (const { stem, heads: members, anchor } of attachments) {
    const neighbors = attachments.map(a => a.stem).filter(s => s.up === stem.up);
    const marks = attachedBeams(stem, beams, neighbors, space);
    const flag = geometry.glyphs.find(g => codePoint(g) >= 0xe240 && codePoint(g) <= 0xe245
      && within(g.x, stem.x, space * 0.2) && within(g.y, stem.far, space * 0.35));
    const levels = marks.length || (flag ? 1 + Math.floor((codePoint(flag) - 0xe240) / 2) : 0);
    const shared = levels > 0 && attachments.some(a => a.stem !== stem && a.heads.includes(anchor));
    const duplicate = shared ? doubled.get(anchor) : undefined;
    const chord = shared ? [duplicate ?? anchor] : members;
    const value = codePoint(anchor) === HALF && !shared ? 'half' : BEAM_VALUES[levels];
    if (!value) return null;
    const right = Math.max(...chord.map(h => h.x));
    const firstDots = shared ? [] : dots.filter(d => d.x - right > space * 1.3 && d.x - right < space * 2.35
      && chord.some(h => within(d.y, h.y, space * 0.55)));
    const doubleDotted = firstDots.some(first => dots.some(next => within(next.y, first.y, space * 0.08)
      && within(next.x - first.x, space * 0.65, space * 0.12)));
    const duration: WrittenDuration = { value, dots: doubleDotted ? 2 : firstDots.length ? 1 : 0 };
    output.push({ x: anchor.x, heads: chord, stem, duration, beats: durationBeats(duration),
      beams: value === 'half' ? [] : marks, ...(shared ? { hiddenHead: anchor } : {}) });
  }
  const wholeColumns: PianoAttack[] = [];
  for (const head of heads.filter(h => !output.some(a => a.heads.includes(h))).sort((a, b) => a.x - b.x)) {
    if (codePoint(head) !== WHOLE) return null;
    const column = wholeColumns.at(-1);
    if (column && within(column.x, head.x, space * 0.15)) column.heads.push(head);
    else wholeColumns.push({ x: head.x, heads: [head], duration: { value: 'whole', dots: 0 }, beats: 4, beams: [] });
  }
  // A displaced second can share its column with other heads in the chord.
  // Collect the whole column before looking for the pair a staff step apart.
  for (const column of wholeColumns) {
    const chord = output.find(a => !a.stem && within(column.x - a.x, space * 1.4, space * 0.13)
      && a.heads.some(h => column.heads.some(head => within(Math.abs(h.y - head.y), space * 0.5, space * 0.08))));
    if (chord) chord.heads.push(...column.heads);
    else output.push(column);
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
  output.sort((a, b) => a.x - b.x || a.beats - b.beats);
  applyTriplets(output, geometry, space);
  return output;
}
