import type { Articulation } from '../../../domain/notation/written';
import type { PdfGlyph } from './geometry';
import { codePoint, within } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

const ARTICULATIONS = new Map<number, Articulation>([
  [0xe4a0, 'accent'], [0xe4a2, 'staccato'], [0xe4a4, 'tenuto'],
  [0xe4a6, 'staccatissimo'], [0xe4ac, 'marcato'],
  [0xe4b2, 'portato'],
]);

/** MuseScore places a chord's marks relative to its outer heads or to its
 * stem tip. MusicXML records each articulation on the first chord member. */
export function readPianoNoteMarks(glyphs: readonly PdfGlyph[], notes: TimedNote[], space: number): TimedNote[] {
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
  const wiggles = glyphs.filter(g => codePoint(g) === 0xeaa9 || codePoint(g) === 0xeaad);
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
  // A digit between simultaneous voices can fall within range of both.
  // Keep a stack intact and give it to the nearest complete chord it fits.
  const fingerColumns = chords.map(chord => {
    const bottom = Math.min(...chord.map(i => output[i]!.y));
    const top = Math.max(...chord.map(i => output[i]!.y));
    const first = output[chord[0]!]!;
    const distance = (g: PdfGlyph) => Math.max(bottom - g.y, g.y - top);
    const marks = fingers.filter(g => within(g.x - (first.columnX ?? first.x), space * .2, space * .15)
      && distance(g) > 0 && distance(g) < 8 * space).sort((a, b) => a.y - b.y);
    return { chord, bottom, marks, distance };
  });
  const stacksOfDigits = fingerColumns.flatMap(column => {
    const { chord, bottom, distance } = column;
    // Two rows of digits can share the same horizontal column between
    // staves. Separate them only when each digit has a clear nearer chord.
    const marks = column.marks.length <= chord.length ? column.marks : column.marks.filter(mark =>
      !fingerColumns.some(other => other !== column && other.marks.includes(mark)
        && other.distance(mark) <= distance(mark) + space * 0.02));
    if (marks.length !== chord.length) return [];
    return [{ chord, bottom, marks, gap: Math.min(...marks.map(distance)) }];
  });
  for (const stack of stacksOfDigits) {
    if (stacksOfDigits.some(other => other !== stack && other.gap <= stack.gap + 0.02 * space
      && other.marks.some(mark => stack.marks.includes(mark)))) continue;
    for (const [i, index] of stack.chord.entries()) {
      const entry = output[index]!, mark = stack.marks[i]!;
      output[index] = { ...entry, note: { ...entry.note, fingering: { text: mark.text, below: mark.y < stack.bottom } } };
    }
  }
  for (const [index, entry] of output.entries()) {
    const parens = glyphs.filter(g => within(g.y, entry.y, space * .1));
    if (parens.some(g => codePoint(g) === 0xe0f5 && within(entry.x - g.x, space * .91, space * .15))
      && parens.some(g => codePoint(g) === 0xe0f6 && within(g.x - entry.x, space * 1.83, space * .15))) {
      output[index] = { ...entry, note: { ...entry.note, parenthesized: true } };
    }
  }
  const marks = glyphs.filter(g => {
    const code = codePoint(g);
    return ARTICULATIONS.has(code - code % 2) || code === 0xe4c0 || code === 0xe4c1;
  });
  const stacks = new Map<number, { kind: Articulation; distance: number }[]>();
  for (const mark of marks) {
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
    const closest = candidates[0];
    if (!closest) continue;
    const index = closest.chord[0]!;
    if (kind) {
      const stack = stacks.get(index) ?? [];
      stack.push({ kind, distance: closest.distance });
      stacks.set(index, stack);
    } else {
      const entry = output[index]!;
      output[index] = { ...entry, note: { ...entry.note, fermata: sign === 1 ? 'upright' : 'inverted' } };
    }
  }
  for (const [index, stack] of stacks) {
    const entry = output[index]!;
    const articulations = stack.sort((a, b) => a.distance - b.distance).map(mark => mark.kind);
    output[index] = { ...entry, note: { ...entry.note, articulations: [...entry.note.articulations, ...articulations] } };
  }
  return output;
}
