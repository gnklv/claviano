import { pedalDownAt, SOFT_PEDAL_LOUDNESS, soundingDurations } from '../../domain/pedal';
import type { Score } from '../../domain/score';
import type { Instrument, NoteToPrepare } from '../ports/Instrument';
import type { Playback } from './Playback';

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
    seconds: Math.max(note.duration, sustained[index]) / tempo,
  }));
}

/**
 * Keeps the instrument ready for what Playback is about to play: tells it the notes again when
 * another piece is opened or the tempo changes.
 */
export function keepInstrumentPrepared(playback: Playback, instrument: Instrument): void {
  let score: Score | null = null;
  let tempo = 0;
  playback.onChange(() => {
    if (playback.score === score && playback.tempo === tempo) return;
    ({ score, tempo } = playback);
    instrument.prepare(score ? notesToPrepare(score, tempo) : []);
  });
}
