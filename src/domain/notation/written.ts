import type { Hand } from '../note';
import type { NoteValue, WrittenDuration } from './noteValue';
import type { OrnamentMark } from './ornaments';
import type { Accidental, SpelledPitch } from './spelling';

/*
 * Notes as printed: what is on the page, and nothing about when it sounds. Unlike the sounding
 * notes of a Score, tied notes stay separate here. From a notation file (MusicXML) the value,
 * accidental, stem and beams are what the engraver chose; for a performance (MIDI) they are
 * written down by the domain (see transcription.ts).
 */

export type Clef = 'treble' | 'bass';

/** A clef set on a staff from `beat` on (engravers switch the lower staff to treble for high passages). */
export interface ClefChange {
  /** 1 is the upper staff, 2 the lower one. */
  readonly staff: number;
  readonly beat: number;
  readonly clef: Clef;
  /**
   * A clef with a small 8 over it (1) or under it (−1), or a 15 (±2): the notes sound that many
   * octaves above where they are printed.
   */
  readonly octaves?: number;
}

/** A clef as printed: the sign, and the octaves it moves the notes by (0 for a plain clef). */
export interface ClefSign {
  readonly clef: Clef;
  readonly octaves: number;
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
  /** The printed bar it is in. */
  readonly bar: number;
  /** 1 is the upper staff, 2 the lower one. */
  readonly staff: number;
  readonly voice: string;
  readonly hand: Hand;
  /** True when it shares the stem of the previous note (a chord). */
  readonly chord: boolean;
  /** The clef in force on its staff, which decides where the pitch sits. */
  readonly clef: Clef;
  readonly pitch: SpelledPitch;
  /** The MIDI pitch it sounds at: its printed pitch, moved by any octave shift it stands under. */
  readonly sounding: number;
  /** Start and length along the page, in quarter notes (a triplet eighth lasts 1/3). */
  readonly beat: number;
  readonly beats: number;
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
  /** Its own loudness, when the source sets one for this note alone (a percentage of forte). */
  readonly dynamics: number | null;
  /** Ornament signs at the note (a trill, a mordent, a turn). */
  readonly ornaments: readonly OrnamentMark[];
  /** A wavy line follows the trill sign, for the length of the note. */
  readonly trillLine: boolean;
  /** Strokes on the stem (the note repeated), or between this note and the next (the two in turn). */
  readonly tremolo: { readonly type: 'single' | 'start' | 'stop'; readonly strokes: number } | null;
  /** Part of a rolled chord (a wavy line before it): from the bottom up, or from the top down. */
  readonly arpeggio: 'up' | 'down' | null;
  /** Printed small (cue size): a part that stands behind the main one, an optional note. It sounds as any other. */
  readonly small?: boolean;
  /** Not printed: it only sounds (the engraver hid it). */
  readonly hidden?: boolean;
  /**
   * Printed without its head: a stem and beams only. So a voice shares a note with another voice,
   * which has the head.
   */
  readonly headless?: boolean;
}

/** A grace note as printed: a small note with no time of its own on the page (see grace.ts for how it is played). */
export interface WrittenGrace {
  /** 1 is the upper staff, 2 the lower one. */
  readonly staff: number;
  readonly hand: Hand;
  readonly clef: Clef;
  readonly pitch: SpelledPitch;
  /** The MIDI pitch it sounds at (see WrittenNote). */
  readonly sounding: number;
  readonly accidental: Accidental | null;
  /** True when it shares the stem of the grace note before it (a grace chord). */
  readonly chord: boolean;
  /** Struck through: an acciaccatura. */
  readonly slash: boolean;
  /** Its printed value (an eighth, a sixteenth…): how many flags or beams it has. */
  readonly value: NoteValue;
  /** A slur starts here, to the note it leads to. */
  readonly slur: boolean;
}

/** Grace notes written together before one note, or after the last note of a bar. */
export interface WrittenGraces {
  /** The printed bar they are in. */
  readonly bar: number;
  /** The place they stand before, along the page: the note they lead to, or the bar's end. */
  readonly beat: number;
  /** The note they lead to (an index into the written notes); null when there is none. */
  readonly leadsTo: number | null;
  readonly notes: readonly WrittenGrace[];
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

/** The written notes that share a stem: a chord, or a single note. */
export type WrittenChord = readonly [WrittenNote, ...WrittenNote[]];
