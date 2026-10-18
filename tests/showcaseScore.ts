import { readFileSync } from 'node:fs';
import { barNumber } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';

/* The showcase score (public/demos/showcase.musicxml, built by scripts/showcase.ts), parsed and laid out once for its tests. */

// Tests run from the project root; in happy-dom import.meta.url is not a file path.
const file = readFileSync('public/demos/showcase.musicxml');
export const score = new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
export const layout = layoutNotation(score);

/** Chords of one bar (by printed number) on one staff, left to right. */
export const chordsIn = (number: number, staff: 'treble' | 'bass' = 'treble') =>
  layout.chords.filter((c) => barNumber(score, c.bar) === number && c.staff === staff).sort((a, b) => a.beat - b.beat);
