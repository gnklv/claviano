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

/**
 * The hands of notes that come in lines, where nothing says whose a line is (a MIDI file's tracks):
 * of two lines the higher is the right hand's, as a pianist's hands lie; one line, or more than
 * two, is both hands at once, and is shared out by pitch. `line`: which line each note is in.
 */
export function handsByLine(notes: readonly { readonly pitch: number; readonly line: number }[]): Hand[] {
  const lines = new Map<number, { sum: number; count: number }>();
  for (const { pitch, line } of notes) {
    const entry = lines.get(line) ?? { sum: 0, count: 0 };
    entry.sum += pitch;
    entry.count++;
    lines.set(line, entry);
  }
  const [first, second, ...others] = [...lines];
  if (!first || !second || others.length > 0) return notes.map((note) => handBySplitPoint(note.pitch));
  const mean = ({ sum, count }: { sum: number; count: number }) => sum / count;
  const right = mean(first[1]) >= mean(second[1]) ? first[0] : second[0];
  return notes.map((note) => (note.line === right ? 'right' : 'left'));
}
