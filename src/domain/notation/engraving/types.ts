import type { Hand } from '../../note';
import type { WrittenDuration } from '../noteValue';
import type { OrnamentKind } from '../ornaments';
import type { Accidental } from '../spelling';
import type { Articulation, Clef } from '../written';

/*
 * What an engraved score is made of: chords on their stems and everything set around them.
 * Vertical places are in staff steps (see staffPosition.ts), horizontal ones in the caller's measure.
 */

/** The horizontal place of `beat` in printed bar `bar`, in the caller's own measure. */
export type Place = (bar: number, beat: number) => number;

/** One notehead of a chord. */
export interface StaffNote {
  /** Staff step: half spaces from the top line down (see staffLayout). */
  readonly step: number;
  readonly accidental: Accidental | null;
  /**
   * Drawn on the other side of the stem. Two notes a second apart cannot sit side by side on one
   * stem, so one of them moves over: the upper one to the right of an up-stem, the lower one to
   * the left of a down-stem.
   */
  readonly displaced?: boolean;
}

/** Notes on one staff that start together and look the same share a stem: a chord (or a single note). */
export interface StaffChord {
  readonly staff: Clef;
  readonly hand: Hand;
  /** Its horizontal place (see Place). */
  readonly x: number;
  /** Start and length along the page, in quarter notes, and the printed bar it is in. */
  readonly beat: number;
  readonly beats: number;
  readonly bar: number;
  /** Index of the beam joining it to its neighbours (see NotationLayout.beams), if any. */
  readonly beam: number | null;
  /**
   * Set on the first chord after a hand moves to the other staff, where the score writes
   * "L.H." / "R.H." (л. р. / п. р.) so the reader knows which hand plays it.
   */
  readonly handMark: boolean;
  /**
   * Moved right by a notehead's width: the up-stem voice where two voices on one staff meet a
   * second apart, so their heads do not sit on each other.
   */
  readonly voiceShift?: boolean;
  /** Sorted from the top of the staff down. */
  readonly notes: readonly StaffNote[];
  readonly duration: WrittenDuration;
  readonly stemUp: boolean;
  /** Steps that need a short extra line (above or below the staff). */
  readonly ledgerSteps: readonly number[];
  /** When it sounds, in seconds, for highlighting under the cursor. */
  readonly start: number;
  readonly end: number;
}

/** Chords whose stems are joined by beams; they share one stem direction. */
export interface Beam {
  /** Indices into NotationLayout.chords, left to right. */
  readonly chords: readonly number[];
  readonly stemUp: boolean;
}

/** A tuplet group: "3" over three notes played in the time of two. */
export interface Tuplet {
  /** Indices into NotationLayout.chords, left to right. */
  readonly chords: readonly number[];
  /** The number shown, e.g. 3 for a triplet. */
  readonly number: number;
  readonly showNumber: boolean;
  /** A bracket is drawn when the group is not one beam (or when the source asks for it). */
  readonly bracket: boolean;
  /** On the stem side: above when stems go up. */
  readonly above: boolean;
}

/** A rest on the tape. */
export interface StaffRest {
  /** Which staff it is on: 'treble' is the upper one, 'bass' the lower. */
  readonly staff: Clef;
  /** Horizontal centre, in bar units. */
  readonly x: number;
  /** Vertical reference of the glyph, in staff steps (see staffLayout). */
  readonly step: number;
  readonly duration: WrittenDuration;
}

/** A tie from a note of one chord to the same pitch in a later chord. */
export interface Tie {
  readonly from: number;
  readonly to: number;
  /** Staff step of the tied note. */
  readonly step: number;
  /** Curving up (above the note) or down. */
  readonly above: boolean;
}

/** A sign at a chord: an articulation or a fermata. */
export interface StaffMark {
  readonly chord: number;
  readonly kind: Articulation | 'fermata';
  readonly above: boolean;
  /** Vertical reference of the glyph, in staff steps. */
  readonly step: number;
}

/** A phrasing slur (legato) from one chord to another. */
export interface StaffSlur {
  readonly from: number;
  readonly to: number;
  readonly above: boolean;
  /** Chords on the same staff between its ends, which it must pass clear of. */
  readonly between: readonly number[];
}

/** An octave shift bracket (8va, 8vb…) over or under the notes from `from` to `to` (bar units). */
export interface StaffOctaveShift {
  readonly staff: Clef;
  readonly from: number;
  readonly to: number;
  /** How many octaves lower the notes are printed than they sound (negative: higher, as 8vb). */
  readonly octaves: number;
}

/** An ornament sign over (or under) a chord: a trill, a mordent, a turn. */
export interface StaffOrnament {
  readonly chord: number;
  readonly kind: OrnamentKind;
  readonly above: boolean;
  /** Where the sign is, in bar units: over the note, or after it for a delayed turn. */
  readonly x: number;
  /** Vertical reference of the sign, in staff steps: the edge nearest the notes. */
  readonly step: number;
  /** Small accidentals over and under the sign. */
  readonly accidentalAbove: Accidental | null;
  readonly accidentalBelow: Accidental | null;
  /** Where a trill's wavy line ends, in bar units; null without one. */
  readonly lineTo: number | null;
}

/** Tremolo strokes: on a chord's stem, or between it and the chord `to`. */
export interface StaffTremolo {
  readonly chord: number;
  readonly strokes: number;
  readonly to: number | null;
}

/** A rolled chord: a wavy line before these chords (one on each staff when the roll goes through both hands). */
export interface StaffArpeggio {
  readonly chords: readonly number[];
  readonly down: boolean;
}

/**
 * Grace notes before one note (or after the last note of a bar): small notes drawn to the left of
 * the place they lead to, on one stem direction, beamed together when there are several.
 */
export interface StaffGrace {
  readonly staff: Clef;
  readonly hand: Hand;
  readonly bar: number;
  /** Where they lead to, in bar units: the note's place, or the end of the bar. */
  readonly x: number;
  /** The chord they lead to (an index into NotationLayout.chords); null after the last note of a bar. */
  readonly principal: number | null;
  /** The grace notes left to right; each may be a chord (notes sorted from the top down). */
  readonly slots: readonly { readonly notes: readonly StaffNote[]; readonly ledgerSteps: readonly number[] }[];
  /** Struck through: an acciaccatura. */
  readonly slash: boolean;
  /** Flags on a lone grace note, beams on a group: 1 for eighths, 2 for sixteenths… */
  readonly beams: number;
  /** A slur joins them to the note they lead to. */
  readonly slur: boolean;
  /** When they sound along the page and for how long (all of them), for lighting them up. */
  readonly beat: number;
  readonly beats: number;
}

export interface NotationLayout {
  /** Sorted by their place on the page (beat). */
  readonly chords: readonly StaffChord[];
  readonly octaveShifts: readonly StaffOctaveShift[];
  readonly beams: readonly Beam[];
  readonly tuplets: readonly Tuplet[];
  readonly rests: readonly StaffRest[];
  readonly ties: readonly Tie[];
  readonly marks: readonly StaffMark[];
  readonly slurs: readonly StaffSlur[];
  readonly graces: readonly StaffGrace[];
  readonly ornaments: readonly StaffOrnament[];
  readonly tremolos: readonly StaffTremolo[];
  readonly arpeggios: readonly StaffArpeggio[];
}
