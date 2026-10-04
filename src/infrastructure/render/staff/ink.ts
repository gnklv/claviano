import { firstAtOrAfter } from '../../../domain/search';
import type { StaffChord, StaffMark } from '../notationLayout';
import type { Clef } from '../staffLayout';
import type { StaffGeometry } from './geometry';
import { HEAD_WIDTH } from './glyphs';

export const STEM_LENGTH = 3.5;
/** Longer stems for three flags, so the flags don't run into the notehead. */
export const STEM_LENGTH_32ND = 4.25;
const STEM_WIDTH = 0.12;

/** Where a chord's parts go, in pixels. */
export interface ChordGeometry {
  yOf: (step: number) => number;
  headWidth: number;
  left: number;
  stemWidth: number;
  stemX: number;
  /** The y of its highest and its lowest notehead. */
  highest: number;
  lowest: number;
}

/**
 * The chords as drawn: where each one's heads and stem are, and how far the notes reach up and
 * down anywhere along the tape. What is drawn around the notes (beams, bar numbers, brackets,
 * dynamics, pedal marks) asks here to keep clear of them.
 */
export class StaffInk {
  /** The piece laid out as chords, sorted by start time. */
  chords: StaffChord[] = [];
  /** The marks (staccato, accents…) of each chord, by its index. */
  marksOf = new Map<number, StaffMark[]>();
  /** Where beams end the stems of their chords, by chord index; filled as the beams are drawn. */
  readonly stemEnds = new Map<number, number>();
  /** Chord indices in order along the tape, to find the chords near a place by halving. */
  private along: number[] = [];
  /** Geometry of the current drawing (it depends on the size and the room at bar lines). */
  private readonly geometry = new Map<StaffChord, ChordGeometry>();
  /** What else is drawn among the notes in this drawing (grace notes): where, and how far up and down. */
  private readonly others: { staff: Clef; left: number; right: number; top: number; bottom: number }[] = [];

  constructor(private readonly staff: StaffGeometry) {}

  setChords(chords: StaffChord[], marks: readonly StaffMark[]): void {
    this.chords = chords;
    this.along = chords.map((_, i) => i).sort((a, b) => chords[a].x - chords[b].x);
    this.marksOf = new Map();
    for (const mark of marks) {
      const own = this.marksOf.get(mark.chord);
      if (own) own.push(mark);
      else this.marksOf.set(mark.chord, [mark]);
    }
  }

  /** Before drawing anew: the size or the room at bar lines may have changed. */
  reset(): void {
    this.geometry.clear();
    this.stemEnds.clear();
    this.others.length = 0;
  }

  /** Counts something drawn among the notes (grace notes) as ink of its staff, in pixels. */
  add(ink: { staff: Clef; left: number; right: number; top: number; bottom: number }): void {
    this.others.push(ink);
  }

  /** Where a chord's parts go, in pixels. */
  of(chord: StaffChord): ChordGeometry {
    let geometry = this.geometry.get(chord);
    if (!geometry) {
      geometry = this.measure(chord);
      this.geometry.set(chord, geometry);
    }
    return geometry;
  }

  /** Where chord `index`'s stem ends: at its beam, or a stem's length past its outer note. */
  stemEnd(index: number): number {
    const chord = this.chords[index];
    const g = this.of(chord);
    return this.stemEnds.get(index) ?? (chord.stemUp ? g.highest - STEM_LENGTH * this.staff.space : g.lowest + STEM_LENGTH * this.staff.space);
  }

  /**
   * Indices of the chords whose noteheads may reach between two x's (in pixels), in order along
   * the tape. Callers still check each one: this only skips the chords far away.
   */
  near(left: number, right: number): number[] {
    // A head reaches half its width left of its x, or one and a half when moved aside for a second.
    const reach = 2 * HEAD_WIDTH.whole * this.staff.space;
    const x = (index: number) => this.staff.px(this.chords[index].x);
    const near: number[] = [];
    for (let i = firstAtOrAfter(this.along, left - reach, x); i < this.along.length; i++) {
      if (x(this.along[i]) > right + reach) break;
      near.push(this.along[i]);
    }
    return near;
  }

  /** Indices of one staff's chords whose noteheads are between two x's. */
  within(staff: Clef, left: number, right: number): number[] {
    return this.near(left, right).filter((index) => {
      const chord = this.chords[index];
      if (chord.staff !== staff) return false;
      const g = this.of(chord);
      return g.left + g.headWidth >= left && g.left <= right;
    });
  }

  /** How far up and down the notes and stems of one staff reach between two x's (±Infinity: nothing there). */
  extent(staff: Clef, left: number, right: number): { top: number; bottom: number } {
    const { space } = this.staff;
    let top = Infinity;
    let bottom = -Infinity;
    for (const index of this.within(staff, left, right)) {
      const chord = this.chords[index];
      const g = this.of(chord);
      top = Math.min(top, g.highest - space / 2);
      bottom = Math.max(bottom, g.lowest + space / 2);
      if (chord.duration.value === 'whole') continue;
      if (chord.stemUp) top = Math.min(top, this.stemEnd(index));
      else bottom = Math.max(bottom, this.stemEnd(index));
    }
    for (const other of this.others) {
      if (other.staff !== staff || other.right < left || other.left > right) continue;
      top = Math.min(top, other.top);
      bottom = Math.max(bottom, other.bottom);
    }
    return { top, bottom };
  }

  private measure(chord: StaffChord): ChordGeometry {
    const { space } = this.staff;
    const top = this.staff.staffTop(chord.staff);
    const yOf = (step: number) => top + (step * space) / 2;
    const headWidth = HEAD_WIDTH[chord.duration.value] * space;
    const left = this.staff.px(chord.x) - headWidth / 2 + (chord.voiceShift ? headWidth : 0);
    const stemWidth = STEM_WIDTH * space;
    return {
      yOf,
      headWidth,
      left,
      stemWidth,
      // Up: on the heads' right side; down: on their left side.
      stemX: chord.stemUp ? left + headWidth - stemWidth / 2 : left + stemWidth / 2,
      highest: yOf(chord.notes[0].step),
      lowest: yOf(chord.notes[chord.notes.length - 1].step),
    };
  }
}
