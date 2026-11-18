import type { Articulation } from '../../../domain/notation/written';
import type { PdfGlyph } from './geometry';
import { codePoint, within } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

const ARTICULATIONS = new Map<number, Articulation>([
  [0xe4a0, 'accent'], [0xe4a2, 'staccato'], [0xe4a4, 'tenuto'],
  [0xe4a6, 'staccatissimo'], [0xe4ac, 'marcato'],
]);

/** MuseScore places a chord's marks relative to its outer heads or to its
 * stem tip. MusicXML records each articulation on the first chord member. */
export function museScoreNoteMarks(glyphs: readonly PdfGlyph[], notes: TimedNote[], space: number): TimedNote[] {
  const output = [...notes];
  const columns = new Map<string, number[]>();
  for (const [index, entry] of output.entries()) {
    if (entry.note.headless) continue;
    const key = [entry.note.staff, entry.note.voice, entry.note.beat].join('/');
    const chord = columns.get(key) ?? [];
    chord.push(index);
    columns.set(key, chord);
  }
  const chords = [...columns.values()];
  const wiggles = glyphs.filter(g => codePoint(g) === 0xeaa9);
  for (const chord of chords) {
    const x = Math.min(...chord.map(i => output[i]!.x));
    for (const index of chord) {
      const entry = output[index]!;
      if (wiggles.some(w => x - w.x >= space * .35 && x - w.x < space * 2.3
        && within(w.y, entry.y, space * .93))) {
        output[index] = { ...entry, note: { ...entry.note, arpeggio: 'up' } };
      }
    }
  }
  const fingers = glyphs.filter(g => /^[1-5]$/.test(g.text) && within(g.size, 1.6 * space, .12 * space));
  for (const chord of chords) {
    const entries = chord.map(index => output[index]!);
    const bottom = Math.min(...entries.map(n => n.y));
    const top = Math.max(...entries.map(n => n.y));
    const marks = fingers.filter(g => within(g.x - entries[0]!.x, space * .2, space * .15)
      && (g.y < bottom && bottom - g.y < 8 * space || g.y > top && g.y - top < 8 * space))
      .sort((a, b) => a.y - b.y);
    if (marks.length === chord.length) {
      for (const [i, index] of chord.entries()) {
        const entry = output[index]!, mark = marks[i]!;
        output[index] = { ...entry, note: { ...entry.note, fingering: { text: mark.text, below: mark.y < bottom } } };
      }
    }
  }
  for (const [index, entry] of output.entries()) {
    const parens = glyphs.filter(g => within(g.y, entry.y, space * .1));
    if (parens.some(g => codePoint(g) === 0xe0f5 && within(entry.x - g.x, space * .91, space * .15))
      && parens.some(g => codePoint(g) === 0xe0f6 && within(g.x - entry.x, space * 1.83, space * .15))) {
      output[index] = { ...entry, note: { ...entry.note, parenthesized: true } };
    }
  }
  const ranked = glyphs.filter(g => {
    const code = codePoint(g);
    return ARTICULATIONS.has(code - code % 2) || code === 0xe4c0 || code === 0xe4c1;
  }).sort((a, b) => codePoint(b) - codePoint(a));
  for (const mark of ranked) {
    const code = codePoint(mark);
    const kind = ARTICULATIONS.get(code - code % 2);
    const sign = code % 2 ? -1 : 1;
    const candidates = chords.flatMap(chord => {
      const entries = chord.map(i => output[i]!);
      const x = entries[0]!.columnX ?? entries[0]!.x;
      const deltaX = (mark.x - x) / space;
      if (deltaX < -.72 || deltaX > .76) return [];
      const distance = Math.min(...entries.map(n => (mark.y - n.y) * sign / space));
      if (distance < .08 || distance > 8) return [];
      return [{ chord, distance }];
    }).sort((a, b) => a.distance - b.distance);
    const index = candidates[0]?.chord[0];
    if (index === undefined) continue;
    const entry = output[index]!;
    output[index] = { ...entry, note: { ...entry.note, ...(kind
      ? { articulations: [...entry.note.articulations, kind] }
      : { fermata: sign === 1 ? 'upright' : 'inverted' }) } };
  }
  return output;
}
