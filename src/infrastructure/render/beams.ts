import { flagCount, type WrittenDuration } from '../../domain/notation/noteValue';
import type { TimeSignature } from '../../domain/score';

/*
 * Beams: the bars that join the stems of eighths, sixteenths and thirty-seconds instead of flags.
 */

/** What grouping needs to know about a chord. */
export interface BeamCandidate {
  readonly staff: string;
  readonly bar: number;
  /** Start in quarter notes from the beginning of the piece. */
  readonly beat: number;
  /** Beat where its bar starts. */
  readonly barBeat: number;
  readonly duration: WrittenDuration;
  readonly timeSignature: TimeSignature;
}

/**
 * The span notes are beamed within, in quarter notes. Simple metres (2/4, 3/4, 4/4) beam by the
 * quarter; compound ones (3/8, 6/8, 9/8, 12/8) by three eighths.
 */
export function beamUnit({ numerator, denominator }: TimeSignature): number {
  return denominator === 8 && numerator % 3 === 0 ? 1.5 : 1;
}

/**
 * Groups of chords to beam together, as indices into `chords`. A group is two or more flagged
 * chords in a row on one staff, inside one bar and one beam unit. Anything unflagged in between
 * (a quarter, a half…) splits it, and so do two chords at the same beat (different voices).
 */
export function groupBeams(chords: readonly BeamCandidate[]): number[][] {
  const byStaff = new Map<string, number[]>();
  chords.forEach((chord, index) => {
    const list = byStaff.get(chord.staff) ?? [];
    list.push(index);
    byStaff.set(chord.staff, list);
  });

  const groups: number[][] = [];
  for (const indices of byStaff.values()) {
    indices.sort((a, b) => chords[a].beat - chords[b].beat);
    let current: number[] = [];
    let currentWindow = '';
    const close = () => {
      if (current.length >= 2) groups.push(current);
      current = [];
    };

    for (const index of indices) {
      const chord = chords[index];
      if (flagCount(chord.duration.value) === 0) {
        close();
        continue;
      }
      const unit = beamUnit(chord.timeSignature);
      const window = `${chord.bar}:${Math.floor((chord.beat - chord.barBeat + 1e-9) / unit)}`;
      const previous = current.length > 0 ? chords[current[current.length - 1]] : null;
      if (window !== currentWindow || (previous && Math.abs(previous.beat - chord.beat) < 1e-9)) close();
      currentWindow = window;
      current.push(index);
    }
    close();
  }
  return groups;
}

/** A stem's horizontal place and the notehead nearest the beam (its y), in pixels. */
export interface StemPoint {
  readonly x: number;
  readonly noteY: number;
}

/** The line along a beam's outer edge: y = y0 + slope × (x − x0). */
export interface BeamLine {
  readonly x0: number;
  readonly y0: number;
  readonly slope: number;
}

export const beamY = (line: BeamLine, x: number): number => line.y0 + line.slope * (x - line.x0);

/**
 * Where to put a beam. It follows the direction of the melody from the first to the last note,
 * but tilts at most `maxRise` over its length and never steeper than `maxSlope` (short beams
 * would otherwise look like slashes); then it moves away from the notes as far as needed for
 * every stem to be at least `minStem` long.
 */
export function beamLine(
  points: readonly StemPoint[],
  stemUp: boolean,
  { stem, minStem, maxRise, maxSlope = 0.25 }: { stem: number; minStem: number; maxRise: number; maxSlope?: number },
): BeamLine {
  const first = points[0];
  const last = points[points.length - 1];
  const direction = stemUp ? -1 : 1; // screen y grows downwards
  const firstEnd = first.noteY + direction * stem;
  const lastEnd = last.noteY + direction * stem;
  const limit = Math.min(maxRise, maxSlope * (last.x - first.x));
  const rise = Math.max(-limit, Math.min(limit, lastEnd - firstEnd));
  const slope = last.x > first.x ? rise / (last.x - first.x) : 0;

  let line: BeamLine = { x0: first.x, y0: firstEnd, slope };
  // How far each stem falls short of the minimum; move the whole beam by the worst shortfall.
  const shortfall = Math.max(0, ...points.map((p) => minStem - direction * (beamY(line, p.x) - p.noteY)));
  line = { ...line, y0: line.y0 + direction * shortfall };
  return line;
}

/**
 * A beam whose stems point both ways, as when a group runs across both staves (the Moonlight
 * Sonata's triplets start in the bass and go on in the treble): up-stems from the notes below,
 * down-stems from the notes above, meeting a beam in the gap between them. The beam follows the
 * melody down or up, half as steeply (or a quarter), and lies in the middle of the room it has
 * there (every stem at least `minStem` long); where a slant leaves no such room, it lies level.
 */
export function kneeBeamLine(points: readonly (StemPoint & { readonly stemUp: boolean })[], minStem: number): BeamLine {
  const first = points[0];
  const last = points[points.length - 1];
  const melody = last.x > first.x ? (last.noteY - first.noteY) / (last.x - first.x) : 0;
  for (const slope of [melody / 2, melody / 4, 0]) {
    // For this slope, how high and how low the beam may start (y grows downwards).
    const along = (p: StemPoint) => slope * (p.x - first.x);
    const lowest = Math.max(...points.filter((p) => !p.stemUp).map((p) => p.noteY + minStem - along(p)));
    const highest = Math.min(...points.filter((p) => p.stemUp).map((p) => p.noteY - minStem - along(p)));
    if (lowest <= highest || slope === 0) return { x0: first.x, y0: (lowest + highest) / 2, slope };
  }
  return { x0: first.x, y0: first.noteY, slope: 0 }; // not reached: the level try always returns
}

/** A notehead of another voice, in pixels: where it is and how far up and down it reaches. */
export interface BeamObstacle {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Moves a beam off the noteheads of another voice on its staff. Two voices beamed at once (stems
 * up in one, down in the other) easily put a beam across the other voice's notes. The beam first
 * moves towards its own notes, as far as its stems stay at least `shortestStem` long; if that is
 * not enough, it moves away, past the other notes. `band` is the beam's height with all its levels.
 */
export function avoidNotes(
  line: BeamLine,
  points: readonly StemPoint[],
  stemUp: boolean,
  obstacles: readonly BeamObstacle[],
  { band, clearance, shortestStem }: { band: number; clearance: number; shortestStem: number },
): BeamLine {
  // The beam's extent at x: from its outer edge (the line) inwards, towards the notes.
  const extent = (l: BeamLine, x: number) => (stemUp ? [beamY(l, x), beamY(l, x) + band] : [beamY(l, x) - band, beamY(l, x)]);
  const hits = obstacles.filter((o) => {
    const [top, bottom] = extent(line, o.x);
    return o.bottom + clearance > top && o.top - clearance < bottom;
  });
  if (hits.length === 0) return line;

  const moved = (shift: number): BeamLine => ({ ...line, y0: line.y0 + shift });
  const stemsLongEnough = (l: BeamLine) =>
    points.every((p) => (stemUp ? p.noteY - beamY(l, p.x) : beamY(l, p.x) - p.noteY) >= shortestStem);

  // Towards the notes: the beam's inner edge ends up clear of the other voice.
  const inward = stemUp
    ? Math.max(...hits.map((o) => o.bottom + clearance - beamY(line, o.x)))
    : Math.min(...hits.map((o) => o.top - clearance - beamY(line, o.x)));
  const closer = moved(inward);
  if (stemsLongEnough(closer)) return closer;

  // Away from the notes, past the other voice.
  const outward = stemUp
    ? Math.min(...hits.map((o) => o.top - clearance - band - beamY(line, o.x)))
    : Math.max(...hits.map((o) => o.bottom + clearance + band - beamY(line, o.x)));
  return moved(outward);
}
