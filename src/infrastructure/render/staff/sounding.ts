import type { StaffChord, StaffGrace } from '../../../domain/notation/engraving';
import type { Hand } from '../../../domain/note';
import { SAME_MOMENT } from '../../../domain/moment';
import { firstAtOrAfter } from '../../../domain/search';

/*
 * The chords and grace notes sounding where the music is, to be lit in their hand's colour, like the
 * keys on the keyboard. Found along the page, so a repeated bar lights up again on every pass.
 */

/** What sounds: the chords (their indices, in the order of the page) and the groups of grace notes. */
export interface Lit {
  readonly chords: readonly number[];
  readonly graces: readonly number[];
}

const NOTHING: Lit = { chords: [], graces: [] };

export class Sounding {
  private chords: readonly StaffChord[] = [];
  private graces: readonly StaffGrace[] = [];
  private longestChord = 0;
  private lit = NOTHING;

  /** What is drawn now: nothing of it lit yet. */
  set(chords: readonly StaffChord[], graces: readonly StaffGrace[]): void {
    this.chords = chords;
    this.graces = graces;
    this.longestChord = chords.reduce((max, chord) => Math.max(max, chord.beats), 0);
    this.lit = NOTHING;
  }

  /** What sounds at `beat` along the page, chords of muted hands left out: the same object as last time while it is the same. */
  at(beat: number, isHandEnabled: (hand: Hand) => boolean): Lit {
    const chords: number[] = [];
    for (let i = firstAtOrAfter(this.chords, beat - this.longestChord, beatOf); i < this.chords.length; i++) {
      const chord = this.chords[i]!;
      if (chord.beat > beat + SAME_MOMENT) break;
      if (chord.beat + chord.beats > beat + SAME_MOMENT && isHandEnabled(chord.hand)) chords.push(i);
    }
    // Grace notes: few, and each sounds for a moment.
    const graces: number[] = [];
    this.graces.forEach((grace, index) => {
      if (grace.beat <= beat + SAME_MOMENT && grace.beat + grace.beats > beat + SAME_MOMENT && isHandEnabled(grace.hand)) graces.push(index);
    });
    if (!same(chords, this.lit.chords) || !same(graces, this.lit.graces)) this.lit = { chords, graces };
    return this.lit;
  }
}

const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((value, i) => value === b[i]);
const beatOf = (chord: StaffChord): number => chord.beat;
