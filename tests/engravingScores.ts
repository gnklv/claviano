import type { Hand, Note } from '../src/domain/note';
import { createScore, type KeySignature } from '../src/domain/score';
import { transcribed } from '../src/domain/notation/transcription';
import { engrave as layout } from '../src/domain/notation/engraving';

/* Small scores for the engraving's tests, and their layout. */

/** Lays a score out; one given only as played notes is written down first, as the MIDI reader does. */
export const layoutNotation = (score: Parameters<typeof layout>[0]) => layout(score.notation.notes.length > 0 ? score : transcribed(score));

export const chordsOf = (score: Parameters<typeof layoutNotation>[0]) => layoutNotation(score).chords;

/** 60 BPM: one beat per second. Bars of 4/4. */
export const note = (midi: number, beat: number, beats: number, hand: Hand = 'right'): Note => ({
  pitch: midi,
  start: beat,
  duration: beats,
  beat,
  beats,
  velocity: 1,
  hand,
});

export const scoreOf = (notes: Note[], keySignatures: KeySignature[] = []) =>
  createScore('test', notes, [0, 4, 8], { barBeats: [0, 4, 8], keySignatures });
