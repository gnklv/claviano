import type { Hand } from '../note';
import type { WrittenDuration } from './noteValue';
import type { Accidental, SpelledPitch } from './spelling';

/*
 * A note as printed, for sources that carry notation (MusicXML). Unlike the sounding notes of
 * a Score, tied notes stay separate here, and nothing has to be guessed: the value, accidental,
 * stem and beams are what the engraver chose.
 */

export type Clef = 'treble' | 'bass';

/** A clef set on a staff from `beat` on (engravers switch the lower staff to treble for high passages). */
export interface ClefChange {
  /** 1 is the upper staff, 2 the lower one. */
  readonly staff: number;
  readonly beat: number;
  readonly clef: Clef;
}

/** "3 in the time of 2": a triplet is { actual: 3, normal: 2 }. */
export interface TupletRatio {
  readonly actual: number;
  readonly normal: number;
}

/** Where a tuplet group begins, and how it is shown. */
export interface TupletStart {
  readonly showNumber: boolean;
  /** true / false when the file says; null lets the renderer decide (bracket unless beamed). */
  readonly bracket: boolean | null;
}

/** Marks that tell how to play a note. */
export type Articulation = 'staccato' | 'staccatissimo' | 'tenuto' | 'portato' | 'accent' | 'marcato';

/** One end of a phrasing slur (legato). Slurs are matched by number; they may overlap. */
export interface SlurMark {
  readonly type: 'start' | 'stop';
  readonly number: number;
  /** Where the engraver put it; null lets the layout decide. */
  readonly placement: 'above' | 'below' | null;
}

/** One beam level at a note: 1 is the main beam, 2 the sixteenth beam and so on. */
export type BeamMark = 'begin' | 'continue' | 'end' | 'forward hook' | 'backward hook';

export interface WrittenNote {
  /** 1 is the upper staff, 2 the lower one. */
  readonly staff: number;
  readonly voice: string;
  readonly hand: Hand;
  /** True when it shares the stem of the previous note (a chord). */
  readonly chord: boolean;
  /** The clef in force on its staff, which decides where the pitch sits. */
  readonly clef: Clef;
  readonly pitch: SpelledPitch;
  /** Start and length along the page, in quarter notes (a triplet eighth lasts 1/3). */
  readonly beat: number;
  readonly beats: number;
  /** When it first sounds, in seconds. */
  readonly start: number;
  readonly end: number;
  readonly duration: WrittenDuration;
  readonly tuplet: TupletRatio | null;
  readonly tupletStart: TupletStart | null;
  readonly tupletStop: boolean;
  /** The accidental printed before the note, if any (including courtesy ones). */
  readonly accidental: Accidental | null;
  readonly stem: 'up' | 'down' | null;
  /** Beam marks by level, index 0 being level 1. */
  readonly beams: readonly BeamMark[];
  /** A tie begins here (to the next note of the same pitch) and/or ends here. */
  readonly tieStart: boolean;
  readonly tieStop: boolean;
  readonly articulations: readonly Articulation[];
  /** A pause sign over (or, inverted, under) the note. */
  readonly fermata: 'upright' | 'inverted' | null;
  readonly slurs: readonly SlurMark[];
}

/** A printed rest. */
export interface WrittenRest {
  readonly staff: number;
  readonly voice: string;
  readonly beat: number;
  readonly duration: WrittenDuration;
  /** A whole-bar rest: drawn as a whole rest in the middle of the bar, whatever the metre. */
  readonly measure: boolean;
  /** Where the engraver placed it vertically, when the file says; read with `clef`. */
  readonly displayPitch: Pick<SpelledPitch, 'letter' | 'octave'> | null;
  readonly clef: Clef;
}
