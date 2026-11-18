import type { BeamMark, TupletRatio, TupletStart } from '../../../domain/notation/written';
import type { PdfGlyph, PdfPoint, PdfSegment } from './geometry';
import { codePoint, within, type Stem } from './pianoGeometry';

interface Attack {
  readonly head: PdfPoint;
  readonly stem?: Stem | undefined;
  readonly beams: readonly BeamMark[];
  readonly beats: number;
}

interface Marks {
  tuplet: TupletRatio | null;
  tupletStart: TupletStart | null;
  tupletStop: boolean;
}

interface Group {
  first: number;
  last: number;
  bracket: boolean;
}

function equalValues(events: readonly Attack[], group: Group): boolean {
  const first = events[group.first]!;
  return events.slice(group.first, group.last + 1).every(e => e.beats === first.beats && e.beams.length === first.beams.length);
}

function beamGroups(events: readonly Attack[]): Group[] {
  const result: Group[] = [];
  for (let first = 0; first < events.length; first++) {
    if (events[first]!.beams[0] !== 'begin') continue;
    let last = first + 1;
    while (events[last]?.beams[0] === 'continue') last++;
    if (events[last]?.beams[0] === 'end') result.push({ first, last, bracket: false });
  }
  return result.filter(g => equalValues(events, g));
}

// A split bracket has a hooked outer end on each horizontal arm and a gap for the numeral.
function bracketGroups(events: readonly Attack[], digit: PdfGlyph, segments: readonly PdfSegment[], s: number): Group[] {
  const arms = segments.filter(p => within(p.y1, p.y2, 0.03 * s) && within(p.y1, digit.y, 1.4 * s)
    && Math.abs(p.x1 - p.x2) > s).map(p => ({ left: Math.min(p.x1, p.x2), right: Math.max(p.x1, p.x2), y: p.y1 }));
  const hook = (x: number, y: number) => segments.find(p => within(p.x1, x, 0.04 * s) && within(p.x2, x, 0.04 * s)
    && (within(p.y1, y, 0.04 * s) || within(p.y2, y, 0.04 * s)) && within(Math.abs(p.y1 - p.y2), 0.8 * s, 0.4 * s));
  const groups: Group[] = [];
  for (const left of arms.filter(a => within(a.right, digit.x, 0.8 * s))) {
    for (const right of arms.filter(a => a.left > digit.x && a.left < digit.x + 2 * s && within(a.y, left.y, 0.04 * s))) {
      const lh = hook(left.left, left.y), rh = hook(right.right, right.y);
      if (!lh || !rh || (lh.y1 + lh.y2 - 2 * left.y) * (rh.y1 + rh.y2 - 2 * right.y) <= 0) continue;
      const indices = events.flatMap((e, i) => e.head.x >= left.left - 0.3 * s && e.head.x <= right.right + 0.15 * s ? [i] : []);
      if (!indices.length) continue;
      const first = indices[0]!, last = indices.at(-1)!;
      if (within(events[first]!.head.x, left.left, 1.4 * s) && within(events[last]!.head.x, right.right, 1.4 * s))
        groups.push({ first, last, bracket: true });
    }
  }
  return groups;
}

export function isTupletGlyph(glyph: PdfGlyph): boolean {
  return codePoint(glyph) >= 0xe880 && codePoint(glyph) <= 0xe88a;
}

/** Reads simple, equal-value triplets and quintuplets in one monophonic voice. */
export function readTuplets<T extends Attack>(events: readonly T[], glyphs: readonly PdfGlyph[], segments: readonly PdfSegment[],
  space: number, barLength: number): (T & Marks)[] | null {
  const output = events.map((e): T & Marks => ({ ...e, tuplet: null, tupletStart: null, tupletStop: false }));
  const beams = beamGroups(events);
  const visible: Group[] = [];
  const apply = (group: Group, showNumber: boolean) => {
    const actual = group.last - group.first + 1, normal = actual === 3 ? 2 : 4;
    for (let i = group.first; i <= group.last; i++) {
      const e = output[i]!;
      output[i] = {
        ...e, beats: e.beats * normal / actual, tuplet: { actual, normal },
        tupletStart: i === group.first ? { bracket: group.bracket, showNumber } : null, tupletStop: i === group.last
      };
    }
  };
  for (const digit of glyphs.filter(isTupletGlyph)) {
    const actual = codePoint(digit) - 0xe880;
    if (actual !== 3 && actual !== 5) return null;
    const atBeam = beams.filter(g => {
      const a = events[g.first]!.stem, b = events[g.last]!.stem;
      return a && b && within(digit.x + 0.7 * space, (a.x + b.x) / 2, 0.8 * space)
        && within(digit.y, (a.far + b.far) / 2, 2 * space);
    });
    const matches = [...atBeam, ...bracketGroups(events, digit, segments, space)]
      .filter(g => g.last - g.first + 1 === actual && equalValues(events, g));
    if (matches.length !== 1) return null;
    const g = matches[0]!;
    if (output.slice(g.first, g.last + 1).some(e => e.tuplet)) return null;
    visible.push(g);
    apply(g, true);
  }
  const excess = output.reduce((sum, e) => sum + e.beats, 0) - barLength;
  if (within(excess, 0, 0.001)) return output;
  // A hidden repeated grouping needs corroboration from the adjacent printed group,
  // matching horizontal attack spacing and an independently known measure length.
  const hidden = beams.filter(g => !output.slice(g.first, g.last + 1).some(e => e.tuplet)
    && within(events[g.first]!.beats, excess, 0.001)
    && visible.some(v => !v.bracket && (v.last + 1 === g.first || g.last + 1 === v.first)
      && g.last - g.first === v.last - v.first && events[g.first]!.beats === events[v.first]!.beats
      && events.slice(g.first, g.last + 1).every((e, i) => within(e.head.x - events[g.first]!.head.x,
        events[v.first + i]!.head.x - events[v.first]!.head.x, 0.35 * space))));
  if (hidden.length !== 1) return null;
  apply(hidden[0]!, false);
  return output;
}
