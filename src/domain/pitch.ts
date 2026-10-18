/** Range of a standard 88-key piano: La0..Do8. */
export const LOWEST_KEY = 21;
export const HIGHEST_KEY = 108;

/** Fixed-do solfège names are used throughout instead of letter names (C, D, E…). */
export type Step = 'Do' | 'Re' | 'Mi' | 'Fa' | 'Sol' | 'La' | 'Si';
export type Accidental = '' | '#' | 'b';
export type NoteName = `${Step}${Accidental}`;

const STEP_SEMITONES: Record<Step, number> = { Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
const ACCIDENTAL_SEMITONES: Record<Accidental, number> = { '': 0, '#': 1, b: -1 };
const BLACK_KEY_CLASSES = new Set([1, 3, 6, 8, 10]);

/**
 * MIDI note number from a solfège name. Octaves use scientific numbering:
 * pitch('Do', 4) = 60 (middle Do), pitch('La', 4) = 69 (440 Hz).
 */
export function pitch(name: NoteName, octave: number): number {
  const last = name.at(-1);
  const accidental: Accidental = last === '#' || last === 'b' ? last : '';
  const step = (accidental ? name.slice(0, -1) : name) as Step;
  return 12 * (octave + 1) + STEP_SEMITONES[step] + ACCIDENTAL_SEMITONES[accidental];
}

export const isBlackKey = (midi: number): boolean => BLACK_KEY_CLASSES.has(midi % 12);

export const pitchFrequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
