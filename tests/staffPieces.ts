import { readFileSync } from 'node:fs';
import { odeToJoy } from '../src/demo/odeToJoy';
import type { Hand } from '../src/domain/note';
import { engrave } from '../src/domain/notation/engraving';
import { type Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';

/* Pieces for the staff's tests, and what is read off a drawn staff: the chords lit, the bars shaded. */

export const showcase = (): Score => {
  const file = readFileSync('public/demos/showcase.musicxml');
  return new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
};
export const ode = (): Score => odeToJoy('Ode to Joy');

const HAND_COLORS: Record<string, Hand> = { 'var(--right)': 'right', 'var(--left)': 'left' };

/** The hands of the groups lit in a hand's colour, in the order they are drawn. */
export const lit = (container: HTMLElement): Hand[] =>
  [...container.querySelectorAll<SVGGElement>('g')].flatMap((group) => HAND_COLORS[group.style.color] ?? []);

/** The hands of the chords sounding at `beat` along the page, as the engraving has them. */
export const sounding = (score: Score, beat: number): Hand[] =>
  engrave(score)
    .chords.filter((chord) => chord.beat <= beat + 1e-9 && chord.beat + chord.beats > beat + 1e-9)
    .map((chord) => chord.hand);

export const shaded = (container: HTMLElement): SVGRectElement[] => [...container.querySelectorAll<SVGRectElement>('rect')];
