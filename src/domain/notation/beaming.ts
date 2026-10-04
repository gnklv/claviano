import type { TimeSignature } from '../score';
import { flagCount, type WrittenDuration } from './noteValue';

/*
 * Beaming: which notes are joined by a beam. Eighths and shorter notes are beamed within a beat,
 * so the eye sees the beats of the bar.
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
    indices.sort((a, b) => chords[a]!.beat - chords[b]!.beat);
    let current: number[] = [];
    let currentWindow = '';
    const close = () => {
      if (current.length >= 2) groups.push(current);
      current = [];
    };

    for (const index of indices) {
      const chord = chords[index]!;
      if (flagCount(chord.duration.value) === 0) {
        close();
        continue;
      }
      const unit = beamUnit(chord.timeSignature);
      const window = `${chord.bar}:${Math.floor((chord.beat - chord.barBeat + 1e-9) / unit)}`;
      const last = current.at(-1);
      const previous = last === undefined ? null : chords[last]!;
      if (window !== currentWindow || (previous && Math.abs(previous.beat - chord.beat) < 1e-9)) close();
      currentWindow = window;
      current.push(index);
    }
    close();
  }
  return groups;
}
