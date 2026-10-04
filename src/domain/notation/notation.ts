import type { PedalKind, PedalMark } from '../pedal';
import type { KeySignature, OctaveShift, TempoMark, TimeSignature } from '../score';
import type { DynamicAccent, DynamicLevel, DynamicMark, Hairpin } from './dynamics';
import type { BarNavigation } from './navigation';
import type { ClefChange, WrittenGrace, WrittenNote, WrittenRest } from './written';

/*
 * The notation of a piece: everything that is printed on its pages, and nothing about how it
 * sounds in time. A reader of any notation format (MusicXML today) fills this in; performNotation
 * (see performance.ts) then plays it, by the rules of music theory. Places along the page are in
 * quarter notes from the start, as if every bar were printed once and played once.
 */
export interface Notation {
  readonly title: string;
  /** The printed bars, in page order. */
  readonly bars: readonly NotatedBar[];
  /** The notes in the order they are written down, voice by voice within a bar (a chord's notes together). */
  readonly notes: readonly NotatedNote[];
  readonly graces: readonly NotatedGraces[];
  readonly rests: readonly WrittenRest[];
  readonly clefs: readonly ClefChange[];
  readonly keySignatures: readonly KeySignature[];
  readonly timeSignatures: readonly TimeSignature[];
  /** The tempo from a place on, in quarter notes per minute. */
  readonly tempos: readonly NotatedTempo[];
  /** Tempo marks: `printed` as a metronome mark, or only meant (a tempo with no mark on the page). */
  readonly tempoMarks: readonly (TempoMark & { readonly printed: boolean })[];
  /** The pedals going down and coming up, and their marks as printed. */
  readonly pedalMoves: readonly NotatedPedalMove[];
  readonly pedalMarks: readonly PedalMark[];
  readonly octaveShifts: readonly OctaveShift[];
  /** Dynamics: the levels marks set, the marks as printed, hairpins (and words that act as such), and stresses (sf, fp). */
  readonly dynamicLevels: readonly DynamicLevel[];
  readonly dynamics: readonly DynamicMark[];
  readonly hairpins: readonly Hairpin[];
  readonly accents: readonly DynamicAccent[];
}

export interface NotatedBar {
  /** Where it starts along the page and how long it is, in quarter notes (a pickup is shorter than its metre). */
  readonly start: number;
  readonly length: number;
  /** Its repeat signs, voltas and jumps. */
  readonly navigation: BarNavigation;
}

/** A note as printed (see WrittenNote), before it is known when it sounds. */
export interface NotatedNote extends Omit<WrittenNote, 'start' | 'end'> {
  /** The printed bar it is in. */
  readonly bar: number;
  /** The MIDI pitch it sounds at: its printed pitch, moved by any octave shift it stands under. */
  readonly sounding: number;
  /** Its own loudness, when the source sets one for this note alone (a percentage of forte). */
  readonly dynamics: number | null;
}

/** Grace notes written together before one note, or after the last note of a bar. */
export interface NotatedGraces {
  readonly bar: number;
  /** The place they stand before, along the page. */
  readonly beat: number;
  /** The note they lead to (an index into Notation.notes); null when there is none. */
  readonly leadsTo: number | null;
  readonly notes: readonly NotatedGrace[];
}

/** A grace note as printed (see WrittenGrace), with the MIDI pitch it sounds at. */
export interface NotatedGrace extends Omit<WrittenGrace, 'bar' | 'beat' | 'soundBeat' | 'soundBeats'> {
  readonly sounding: number;
}

/**
 * Things that happen at a place in a bar carry the bar too: on a repeat they are played again
 * with it, even when they stand exactly on its last bar line.
 */
export interface NotatedTempo {
  readonly bar: number;
  readonly beat: number;
  readonly bpm: number;
}

export interface NotatedPedalMove {
  readonly bar: number;
  readonly pedal: PedalKind;
  readonly beat: number;
  readonly down: boolean;
}
