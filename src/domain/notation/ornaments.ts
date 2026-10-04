import { keyAlteration, type Accidental, type Alteration, type Letter, type SpelledPitch } from './spelling';

/*
 * Ornaments: signs over a note that stand for several quick notes around it. How they are played
 * is a convention; these are the usual modern ones.
 *
 * - Trill: the note and the one above it in turn, for the note's whole length, ending on the note.
 * - Mordent (the zigzag struck through): the note, the one below, the note. Without the stroke
 *   (the "inverted" one, a short trill): the note, the one above, the note.
 * - Turn: the note above, the note, the note below, the note. Inverted: from below. Delayed (the
 *   sign after the note): the note is held for half its length first.
 * - Tremolo: one note repeated quickly, or two notes (or chords) in turn.
 * - Arpeggio: the notes of a chord one after another instead of together, all held to the end.
 */

export type OrnamentKind = 'trill' | 'mordent' | 'inverted-mordent' | 'turn' | 'inverted-turn' | 'delayed-turn' | 'delayed-inverted-turn';

/** An ornament as printed at a note. */
export interface OrnamentMark {
  readonly kind: OrnamentKind;
  /** A small accidental over or under the sign: it alters the neighbour above or below the note. */
  readonly accidentalAbove: Accidental | null;
  readonly accidentalBelow: Accidental | null;
  /** Under the note instead of over it, when the file says so. */
  readonly below: boolean;
}

/** A piece of an ornamented note as played: the pitch, from `offset` after the note's start, for `beats`. */
export interface Played {
  readonly pitch: number;
  readonly offset: number;
  readonly beats: number;
}

/** How long the quick notes of an ornament last, in quarter notes: a thirty-second. */
export const QUICK_BEATS = 0.125;
/** The notes of a turn are no slower than sixteenths. */
const TURN_BEATS = 0.25;

const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTAL_ALTERATION: Record<Accidental, Alteration> = { 'double-flat': -2, flat: -1, natural: 0, sharp: 1, 'double-sharp': 2 };

/**
 * The MIDI pitch of the note next to `pitch` on the staff, above (`direction` 1) or below (−1):
 * as the key signature has it, unless the ornament carries its own accidental.
 */
export function neighbour(pitch: SpelledPitch, direction: 1 | -1, fifths: number, accidental: Accidental | null): number {
  const index = pitch.octave * 7 + pitch.letter + direction;
  const letter = (((index % 7) + 7) % 7) as Letter;
  const octave = Math.floor(index / 7);
  const alteration = accidental ? ACCIDENTAL_ALTERATION[accidental] : keyAlteration(letter, fifths);
  return 12 * (octave + 1) + LETTER_SEMITONES[letter] + alteration;
}

/** `pitches` one after another from `offset`, each `each` long; the last one lasts to the end of `beats`. */
function run(pitches: readonly number[], offset: number, each: number, beats: number): Played[] {
  return pitches.map((pitch, i) => ({
    pitch,
    offset: offset + i * each,
    beats: i === pitches.length - 1 ? beats - offset - i * each : each,
  }));
}

/**
 * What is played for a note of `beats` at `pitch` under an ornament; `upper` and `lower` are its
 * neighbours (see neighbour).
 */
export function playOrnament(kind: OrnamentKind, pitch: number, beats: number, upper: number, lower: number): Played[] {
  switch (kind) {
    case 'trill': {
      // An odd number of notes, so it ends on the note itself; at least note–upper–note.
      const fitting = Math.floor(beats / QUICK_BEATS);
      const count = Math.max(3, fitting % 2 === 0 ? fitting - 1 : fitting);
      const each = Math.min(QUICK_BEATS, beats / count);
      return run(Array.from({ length: count }, (_, i) => (i % 2 === 0 ? pitch : upper)), 0, each, beats);
    }
    case 'mordent':
    case 'inverted-mordent':
      return run([pitch, kind === 'mordent' ? lower : upper, pitch], 0, Math.min(QUICK_BEATS, beats / 3), beats);
    case 'turn':
    case 'inverted-turn': {
      const [first, third] = kind === 'turn' ? [upper, lower] : [lower, upper];
      return run([first, pitch, third, pitch], 0, Math.min(TURN_BEATS, beats / 4), beats);
    }
    case 'delayed-turn':
    case 'delayed-inverted-turn': {
      const [first, third] = kind === 'delayed-turn' ? [upper, lower] : [lower, upper];
      const half = beats / 2;
      return [{ pitch, offset: 0, beats: half }, ...run([first, pitch, third, pitch], half, Math.min(TURN_BEATS, half / 4), beats)];
    }
  }
}

/** How long each note of a tremolo with `strokes` strokes lasts: one stroke is eighths, two sixteenths… */
export const tremoloBeats = (strokes: number): number => 0.5 / 2 ** (Math.min(4, Math.max(1, strokes)) - 1);

/** A note of `beats` repeated as a tremolo with `strokes` strokes on its stem. */
export function playTremolo(pitch: number, beats: number, strokes: number): Played[] {
  const each = tremoloBeats(strokes);
  const count = Math.max(2, Math.round(beats / each));
  return run(new Array<number>(count).fill(pitch), 0, beats / count, beats);
}

/**
 * A tremolo between two notes or chords, `beats` long in all: which of the two sounds, from when
 * and for how long, starting with the first.
 */
export function playTremoloBetween(beats: number, strokes: number): { second: boolean; offset: number; beats: number }[] {
  const each = tremoloBeats(strokes);
  // An even number of strokes: each of the two sounds as often as the other.
  const count = Math.max(2, 2 * Math.round(beats / each / 2));
  return Array.from({ length: count }, (_, i) => ({ second: i % 2 === 1, offset: (i * beats) / count, beats: beats / count }));
}

/** How far apart the notes of a rolled chord come in. */
const ROLL_BEATS = 0.0625;

/**
 * How much later each of `count` notes of a rolled chord of `beats` comes in, from the first one
 * played (index 0): quickly, and within the first half of the chord.
 */
export function arpeggioDelays(count: number, beats: number): number[] {
  const step = count > 1 ? Math.min(ROLL_BEATS, beats / 2 / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => i * step);
}
