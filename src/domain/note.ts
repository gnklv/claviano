export type Hand = 'left' | 'right';

export const HANDS: readonly Hand[] = ['right', 'left'];

export interface Note {
  /** MIDI note number, 60 = Do4 (middle Do). */
  readonly pitch: number;
  /** Start time in seconds at 100% tempo. Used for playback and falling notes. */
  readonly start: number;
  /** Duration in seconds at 100% tempo. */
  readonly duration: number;
  /**
   * Musical time, used for notation: start in quarter notes from the beginning of the piece.
   * Unlike seconds it does not depend on tempo: the third quarter is always beat 2.
   */
  readonly beat: number;
  /** Musical length in quarter notes: 1 = quarter, 0.5 = eighth, 1.5 = dotted quarter. */
  readonly beats: number;
  /** Loudness, 0..1. */
  readonly velocity: number;
  readonly hand: Hand;
}

export const noteEnd = (note: Note): number => note.start + note.duration;

/** Fallback for sources that do not say which hand plays a note. */
export const handBySplitPoint = (pitch: number, splitPitch = 60): Hand =>
  pitch < splitPitch ? 'left' : 'right';
