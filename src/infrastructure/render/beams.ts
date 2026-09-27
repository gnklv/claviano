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
