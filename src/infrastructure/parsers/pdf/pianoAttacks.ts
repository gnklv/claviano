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
  tupletBracket?: boolean;
  tupletRatio?: { actual: number; normal: number };
  tupletPart?: 'start' | 'continue' | 'stop';
  tremolo?: { type: 'start' | 'stop'; strokes: number };
}

interface Attachment {
  stem: Stem;
  anchor: PdfGlyph;
  heads: PdfGlyph[];
}

/** The stem base identifies the outer note of a chord. A second can displace
 * the next head to the other side of the same stem. */
export function attachHeads(heads: PdfGlyph[], segments: PdfSegment[], space: number): Attachment[] {
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
        // A reduced chord member still has its edge on the full-size stem.
        // Only accept that geometry once a full-size head identifies the stem.
        const reduced = within(anchor.size, space * 4, space * 0.1)
          && within(head.size, space * 2.8, space * 0.08)
          && codePoint(head) === codePoint(anchor)
          && within(line.x1 - head.x, head.size / 4 * (up ? 1.24 : 0.055), space * 0.08);
        return (column.includes(head) || displaced || reduced)
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
    && within(Math.abs(s.y2 - s.y1), space * 0.75, space * 0.27));
  const arms = segments.filter(s => Math.abs(s.x2 - s.x1) >= space
    && Math.abs(s.y2 - s.y1) < 0.4 * Math.abs(s.x2 - s.x1)
    && within((s.y1 + s.y2) / 2, digit.y, 1.8 * space))
    .map(s => s.x1 < s.x2 ? s : { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 });
  return arms.some(s => within(s.x1, first.x, space * 1.6) && within(s.x2, digit.x, space)
    && s.x2 < digit.x && hook(s.x1, s.y1))
    && arms.some(s => within(s.x2, last.x, space * 1.9) && s.x1 > digit.x
      && s.x1 < digit.x + space * 2.1 && hook(s.x2, s.y2));
}

function markTriplet(group: PianoAttack[], bracket: boolean): void {
  group.forEach((attack, i) => {
    attack.tupletRatio = { actual: 3, normal: 2 };
    attack.tupletPart = i === 0 ? 'start' : i === group.length - 1 ? 'stop' : 'continue';
    if (!i) attack.tupletBracket = bracket;
    attack.beats *= 2 / 3;
  });
}

interface TripletCandidate {
  group: PianoAttack[];
  bracket: boolean;
  distance: number;
}

// A bracket can enclose a quarter and an eighth even when the second
// note changes stem direction.
function mixedTriplets(attacks: PianoAttack[], digit: PdfGlyph, segments: readonly PdfSegment[], space: number): TripletCandidate[] {
  const distance = (attack: PianoAttack) => Math.min(...attack.heads.map(h => Math.abs(h.y - digit.y)),
    Math.abs((attack.stem?.far ?? attack.rest?.y ?? Infinity) - digit.y));
  const candidates = attacks.filter(a => distance(a) < space * 5);
  return candidates.flatMap(first => candidates.filter(last =>
    last.x > first.x && Math.max(first.beats, last.beats) === 2 * Math.min(first.beats, last.beats)
    && !attacks.some(a => a.x > first.x + space * 0.17 && a.x < last.x - space * 0.17
      && (!a.stem || a.stem.up === first.stem?.up))
    && within((first.x + last.x) / 2, digit.x, space * 1.4)
    && bracketedTriplet(first, last, digit, segments, space))
    .map(last => ({ group: [first, last], bracket: true, distance: (distance(first) + distance(last)) / 2 })));
}

function equalTriplets(attacks: PianoAttack[], digit: PdfGlyph, segments: readonly PdfSegment[], space: number): TripletCandidate[] {
  const candidates: TripletCandidate[] = [];
  for (const count of [3, 6]) {
    for (let i = 0; i + count <= attacks.length; i++) {
      const group = attacks.slice(i, i + count);
      const first = group[0]!, middle = group[1]!, last = group[count - 1]!;
      if (group.some(a => !a.stem && !a.rest || a.beats !== first.beats)) continue;
      const midpoint = ((first.stem?.x ?? first.x) + (last.stem?.x ?? last.x)) / 2;
      if (!within(digit.x + .5 * space, midpoint, space * (count === 3 ? 1.4 : 1))) continue;
      const beamed = first.beams.some((mark, level) => mark === 'begin' && last.beams[level] === 'end'
        && group.slice(1, -1).every(a => a.beams[level] === 'continue'));
      const reference = count === 6 && first.stem && last.stem ? (first.stem.far + last.stem.far) / 2
        : middle.stem?.far ?? middle.rest!.y;
      const distance = Math.abs(digit.y - reference);
      const bracket = count === 3 && distance <= 5 * space && bracketedTriplet(first, last, digit, segments, space);
      // Some engravings place the numeral immediately outside the middle
      // head on the opposite side from the beam.
      const headSide = count === 3 && middle.heads.some(h => (digit.y - h.y) * (middle.stem?.up ? -1 : 1) > 0
        && within(digit.y, h.y, 1.4 * space));
      if (bracket || beamed && (distance <= (count === 3 ? 4.5 : 2) * space || headSide)) {
        candidates.push({ group, bracket, distance });
      }
    }
  }
  return candidates;
}

function applyTriplets(attacks: PianoAttack[], geometry: PdfGeometry, space: number): void {
  const voices = [attacks, ...[true, false].map(up => attacks.filter(a => a.stem?.up === up))
    .filter(voice => voice.length < attacks.length && voice.length >= 3)];
  if (!attacks.length) return;
  const left = attacks[0]!.x - space, right = attacks.at(-1)!.x + 2 * space;
  const digits = geometry.glyphs.filter(g => g.x >= left && g.x <= right
    && (g.text === '3' && /ital/i.test(g.font) || codePoint(g) === 0xe883));
  const selected: TripletCandidate[] = [];
  for (const digit of digits) {
    const candidates = [...mixedTriplets(attacks, digit, geometry.segments, space),
      ...voices.flatMap(voice => equalTriplets(voice, digit, geometry.segments, space))];
    candidates.sort((a, b) => Number(b.bracket) - Number(a.bracket) || a.distance - b.distance);
    const first = candidates[0];
    if (!first) continue;
    // The full staff and the stem-direction pass can identify the same
    // group. A genuinely distinct, equally near group is ambiguous.
    const ambiguous = candidates.some(c => c.bracket === first.bracket && within(c.distance, first.distance, .1 * space)
      && (c.group.length !== first.group.length || c.group.some((a, i) => a !== first.group[i])));
    // Both staves can print a numeral in the gap between facing beams.
    // Seen from this staff, both can independently identify the same group.
    if (!ambiguous && !selected.some(c => c.group.length === first.group.length
      && c.group.every((a, i) => a === first.group[i]))) selected.push(first);
  }
  for (const candidate of selected) {
    if (selected.some(other => other !== candidate && other.group.some(a => candidate.group.includes(a)))) continue;
    markTriplet(candidate.group, candidate.bracket);
  }
}

export function readPianoAttacks(
  geometry: PdfGeometry, glyphs: PdfGlyph[], staff: Staff, beams: BeamStrip[], length: number, space = staff.space,
): PianoAttack[] | null {
  const heads: PdfGlyph[] = [];
  const doubled = new Map<PdfGlyph, PdfGlyph>();
  // Opposite stems may have two copies of the same printed head. Reserve one
  // copy per voice when both stems use the head.
  for (const glyph of glyphs.filter(isHead)) {
    const twin = heads.find(head => within(head.x, glyph.x, space * .001) && within(head.y, glyph.y, space * .001)
      && head.text === glyph.text && head.size === glyph.size && head.font === glyph.font);
    if (twin) doubled.set(twin, glyph);
    else heads.push(glyph);
  }
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
    if (duplicate) doubled.delete(anchor);
    const chord = shared ? [duplicate ?? anchor] : members;
    const value = codePoint(anchor) === HALF && !shared ? 'half' : BEAM_VALUES[levels];
    if (!value) return null;
    const right = Math.max(...chord.map(h => h.x));
    const firstDots = shared ? [] : dots.filter(d => d.x - right > space * 1.3 && d.x - right < space * 2.35
      && chord.some(h => within(d.y, h.y, staff.space * 0.55)));
    // Two dotted voices on the same staff line can print their dots in
    // the spaces above and below the displaced head, at the same x.
    if (!shared && !firstDots.length && chord.length === 1) {
      const unison = attachments.find(other => other.stem.up !== stem.up
        && within(other.anchor.x - anchor.x, space * 1.6, space * 0.12)
        && within(other.anchor.y, anchor.y, space * 0.05));
      if (unison) {
        const above = dots.find(dot => within(dot.x - unison.anchor.x, space * 1.65, space * 0.2)
          && within(dot.y - anchor.y, space * 0.5, space * 0.06));
        if (above && dots.some(dot => within(dot.x, above.x, space * 0.05)
          && within(anchor.y - dot.y, space * 0.5, space * 0.06))) firstDots.push(above);
      }
    }
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
