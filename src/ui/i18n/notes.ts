import type { Locale } from './translate';

const SHARP = '♯';

const NAMES: Record<Locale, readonly string[]> = {
  en: ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'],
  ru: ['До', 'До', 'Ре', 'Ре', 'Ми', 'Фа', 'Фа', 'Соль', 'Соль', 'Ля', 'Ля', 'Си'],
};
const IS_SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

/**
 * Russian octave names, indexed by scientific octave number (0..8).
 * Octaves from the first one up are numbered 1..5; the lower ones are abbreviated:
 * ск — субконтроктава, к — контроктава, б — большая, м — малая.
 */
const RUSSIAN_OCTAVES = [' ск', ' к', ' б', ' м', '1', '2', '3', '4', '5'];

const scientificOctave = (midi: number): number => Math.floor(midi / 12) - 1;

/** How a key is labelled on screen: "C♯4" in English, "До♯1" in Russian (same key). */
export function noteLabel(midi: number, locale: Locale): string {
  const pitchClass = midi % 12;
  const name = NAMES[locale][pitchClass] + (IS_SHARP[pitchClass] ? SHARP : '');
  const octave = scientificOctave(midi);
  if (locale === 'en') return `${name}${octave}`;
  return `${name}${RUSSIAN_OCTAVES[Math.min(Math.max(octave, 0), RUSSIAN_OCTAVES.length - 1)]}`;
}
