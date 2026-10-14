import { pedalDownAt, SOFT_PEDAL_LOUDNESS, soundingDurations } from '../../domain/pedal';
import type { Score } from '../../domain/score';
import type { Instrument, NoteToPrepare } from '../ports/Instrument';
import { STRIKE, type FreePlay } from './FreePlay';
import type { Playback } from './Playback';

/** In free play the instrument is kept ready for notes held up to this long, in seconds. */
const HELD_SECONDS = 8;

/**
 * What the instrument must be ready for to play `score` at `tempo` (1 is the written tempo): each
 * note with how hard it is struck and how long it may sound. The longest it can: the pedals hold
 * it, and at a slower tempo it lasts longer in real time.
 */
export function notesToPrepare(score: Score, tempo: number): NoteToPrepare[] {
  const sustained = soundingDurations(score.notes, score.pedal, score.sostenutoPedal);
  return score.notes.map((note, index) => ({
    pitch: note.pitch,
    // Struck with the soft pedal down, a note is played quieter (see Playback).
    velocity: pedalDownAt(score.softPedal, note.start) ? note.velocity * SOFT_PEDAL_LOUDNESS : note.velocity,
    seconds: Math.max(note.duration, sustained[index] ?? 0) / tempo,
  }));
}

/** What the instrument must be ready for in free play: every key shown, struck as a screen strikes them. */
export function keysToPrepare(lowest: number, keys: number): NoteToPrepare[] {
  return Array.from({ length: keys }, (_, key) => ({ pitch: lowest + key, velocity: STRIKE, seconds: HELD_SECONDS }));
}

/**
 * Keeps the instrument ready for what is about to be played: the keys of free play while it is
 * entered, otherwise the piece Playback has open. Tells it again when free play is entered or left
 * or its keyboard moves, when another piece is opened, or when the tempo changes.
 */
export function keepInstrumentPrepared(playback: Playback, freePlay: FreePlay, instrument: Instrument): void {
  /** What the instrument was last made ready for. */
  let readyFor: { score: Score | null; tempo: number } | { lowest: number; keys: number } | null = null;
  const update = () => {
    if (freePlay.entered) {
      const { lowest, keys } = freePlay;
      if (readyFor && 'keys' in readyFor && readyFor.lowest === lowest && readyFor.keys === keys) return;
      readyFor = { lowest, keys };
      instrument.prepare(keysToPrepare(lowest, keys));
    } else {
      const { score, tempo } = playback;
      if (readyFor && 'score' in readyFor && readyFor.score === score && readyFor.tempo === tempo) return;
      readyFor = { score, tempo };
      instrument.prepare(score ? notesToPrepare(score, tempo) : []);
    }
  };
  playback.onChange(update);
  freePlay.onChange(update);
}
