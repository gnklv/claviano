import type { PedalKind, PedalMark } from '../pedal';
import type { KeySignature, OctaveShift, TempoMark, TimeSignature } from '../score';
import type { DynamicLevel, DynamicMark, Hairpin } from './dynamics';
import type { BarNavigation } from './navigation';
import type { ClefChange, WrittenGraces, WrittenNote, WrittenRest } from './written';

/*
 * The notation of a piece: everything that is printed on its pages, and nothing about how it
 * sounds in time. A reader of any notation format (MusicXML today) fills this in; performNotation
 * (see performance.ts) then plays it, by the rules of music theory. Places along the page are in
 * quarter notes from the start, as if every bar were printed once and played once.
 */
export interface Notation {
  readonly title: string;
  /** The printed bars, in page order. */
  readonly bars: readonly WrittenBar[];
  /** The notes in the order they are written down, voice by voice within a bar (a chord's notes together). */
  readonly notes: readonly WrittenNote[];
  readonly graces: readonly WrittenGraces[];
  readonly rests: readonly WrittenRest[];
  readonly clefs: readonly ClefChange[];
  readonly keySignatures: readonly KeySignature[];
  readonly timeSignatures: readonly TimeSignature[];
  /** The tempo from a place on, in quarter notes per minute. */
  readonly tempos: readonly TempoChange[];
  /** Tempo marks (see TempoMark.printed for those the source only implies). */
  readonly tempoMarks: readonly TempoMark[];
  /** The pedals going down and coming up, and their marks as printed. */
  readonly pedalMoves: readonly PedalMove[];
  readonly pedalMarks: readonly PedalMark[];
  readonly octaveShifts: readonly OctaveShift[];
  /** Dynamics as printed: marks (pp, sfz, "cresc."…) and hairpins; and levels set with no mark on the page. */
  readonly dynamics: readonly DynamicMark[];
  readonly hairpins: readonly Hairpin[];
  readonly dynamicLevels: readonly DynamicLevel[];
}

export interface WrittenBar {
  /** Where it starts along the page and how long it is, in quarter notes (a pickup is shorter than its metre). */
  readonly start: number;
  readonly length: number;
  /** Its repeat signs, voltas and jumps. */
  readonly navigation: BarNavigation;
}

/**
 * Things that happen at a place in a bar carry the bar too: on a repeat they are played again
 * with it, even when they stand exactly on its last bar line.
 */
export interface TempoChange {
  readonly bar: number;
  readonly beat: number;
  readonly bpm: number;
}

export interface PedalMove {
  readonly bar: number;
  readonly pedal: PedalKind;
  readonly beat: number;
  readonly down: boolean;
}
