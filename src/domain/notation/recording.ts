import { handBySplitPoint, type Note } from '../note';
import { createScore, type Score } from '../score';
import { quantize } from './quantize';
import { transcribed, writeTempoMarks } from './transcription';

/** A note as it was played: when the key went down and came up, in seconds from the start of the take (null: still down). */
export interface PlayedNote {
  readonly pitch: number;
  readonly start: number;
  readonly end: number | null;
}

/** The beat a take was played to: beats a minute, and the time signature. */
export interface TakeBeat {
  /** Beats a minute: the metronome's clicks. */
  readonly tempo: number;
  readonly numerator: number;
  readonly denominator: number;
  /** A beat, in quarter notes: one in 4/4, one and a half in 6/8. */
  readonly beat: number;
}

/** What is played by hand is written no finer than a sixteenth: finer is how it was played, not what was meant. */
const SIXTEENTH = 0.25;
/** How hard a recorded note is struck (the keys on a screen do not tell). */
const VELOCITY = 0.75;

/**
 * A take written down as a piece: its notes set on the beat it was played to, in bars of its time
 * signature, and taken down as notation the way a performance is (see transcription.ts).
 *
 * Each note is moved to the nearest sixteenth, and lasts to the nearest sixteenth of where the key
 * came up (`now`, for a key still down): the piece plays as it is written, not as it was fumbled.
 * Notes under middle Do are the left hand's.
 */
export function scoreFromTake(title: string, played: readonly PlayedNote[], beat: TakeBeat, now: number): Score {
  const quarterSeconds = 60 / beat.tempo / beat.beat;
  const notes: Note[] = played.map((note) => {
    const at = quantize(note.start / quarterSeconds, ((note.end ?? now) - note.start) / quarterSeconds, SIXTEENTH);
    return {
      pitch: note.pitch,
      start: at.beat * quarterSeconds,
      // (A touch short of its written length, as fingers leave a key: the same key struck again is heard again.)
      duration: at.beats * quarterSeconds * 0.95,
      beat: at.beat,
      beats: at.beats,
      velocity: VELOCITY,
      hand: handBySplitPoint(note.pitch),
    };
  });

  // Whole bars, to the end of the last note.
  const barBeats = (beat.numerator * 4) / beat.denominator;
  const endBeat = notes.reduce((end, note) => Math.max(end, note.beat + note.beats), 0);
  const bars = Math.max(1, Math.ceil(endBeat / barBeats - 1e-9));
  const starts = Array.from({ length: bars }, (_, bar) => bar * barBeats);
  const end = bars * barBeats;

  const score = createScore(
    title,
    notes,
    starts.map((start) => start * quarterSeconds),
    {
      barBeats: starts,
      // (The last bar is whole too, whatever it has of notes.)
      writtenBarBeats: starts,
      writtenEndBeat: end,
      timeSignatures: [{ beat: 0, numerator: beat.numerator, denominator: beat.denominator }],
      tempoMarks: writeTempoMarks([{ beat: 0, perMinute: 60 / quarterSeconds }], starts, end),
      timeMap: [
        { beat: 0, time: 0 },
        { beat: end, time: end * quarterSeconds },
      ],
    },
  );
  return transcribed(score);
}
