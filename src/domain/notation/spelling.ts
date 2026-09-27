/*
 * How a key is *written*. MIDI only knows keys; notation needs a name: the black key between
 * Fa and Sol is Fa♯ in a sharp key and Sol♭ in a flat key.
 */

/** Note letters as scale steps: 0 Do, 1 Re, 2 Mi, 3 Fa, 4 Sol, 5 La, 6 Si. */
export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** −1 flat, 0 natural, +1 sharp. */
export type Alteration = -1 | 0 | 1;

export interface SpelledPitch {
  readonly letter: Letter;
  /** Scientific octave: Do4 is middle Do. */
  readonly octave: number;
  readonly alteration: Alteration;
}

/** Letter of each white key by pitch class; black keys are undefined. */
const WHITE_KEY_LETTERS: (Letter | undefined)[] = [0, undefined, 1, undefined, 2, 3, undefined, 4, undefined, 5, undefined, 6];

/** Spells a MIDI note for a key with `fifths` sharps (positive) or flats (negative). */
export function spell(midi: number, fifths: number): SpelledPitch {
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const white = WHITE_KEY_LETTERS[pitchClass];
  if (white !== undefined) return { letter: white, octave, alteration: 0 };
  // A black key: in sharp keys (and Do major) it is the white key below raised; in flat keys, the one above lowered.
  return fifths >= 0
    ? { letter: WHITE_KEY_LETTERS[pitchClass - 1]!, octave, alteration: 1 }
    : { letter: WHITE_KEY_LETTERS[pitchClass + 1]!, octave, alteration: -1 };
}

/** The order accidentals are added to key signatures: sharps Fa Do Sol Re La Mi Si, flats the reverse. */
const SHARP_ORDER: Letter[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: Letter[] = [6, 2, 5, 1, 4, 0, 3];

/** How the key signature alters a letter: in Sol major (1 sharp) Fa is +1, everything else 0. */
export function keyAlteration(letter: Letter, fifths: number): Alteration {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(letter)) return 1;
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(letter)) return -1;
  return 0;
}

export type Accidental = 'sharp' | 'flat' | 'natural';

const ACCIDENTALS: Record<Alteration, Accidental> = { 1: 'sharp', [-1]: 'flat', 0: 'natural' };

/**
 * Which accidental to print before each note of one bar on one staff, following the rules:
 * nothing if the key signature already says it; a sign when the note differs from what is
 * currently in force (a natural cancels the key signature); a sign lasts until the end of the
 * bar for that exact note (letter and octave). Notes must be in time order.
 */
export function barAccidentals(notes: readonly SpelledPitch[], fifths: number): (Accidental | null)[] {
  const inForce = new Map<string, Alteration>();
  return notes.map((note) => {
    const key = `${note.letter}:${note.octave}`;
    const current = inForce.get(key) ?? keyAlteration(note.letter, fifths);
    if (note.alteration === current) return null;
    inForce.set(key, note.alteration);
    return ACCIDENTALS[note.alteration];
  });
}
