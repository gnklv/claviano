import { keySignatureLetters } from '../../../domain/notation/spelling';
import type { Clef } from '../../../domain/notation/written';
import type { PdfGlyph } from './geometry';
import { musicGlyphCode as code } from './musicGlyphs';
import { BLACK, FLAT, printedClef, WHOLE, pitchAt, sortedX, within, type Measure, type Staff } from './pianoGeometry';

/** Read a signature, including optional naturals cancelling the old signature. */
export function signatureFifths(marks: readonly PdfGlyph[], previous: number, staff: Staff, clef: Clef): number | null {
  const changed = marks.findIndex(mark => code(mark) !== FLAT + 1);
  const naturals = changed < 0 ? marks.length : changed;
  const added = marks.slice(naturals);
  const sign = added.length ? code(added[0]!) - (FLAT + 1) : 0;
  if (added.length > 7 || (added.length && Math.abs(sign) !== 1)
    || added.some(mark => code(mark) !== FLAT + 1 + sign)) return null;
  const fifths = sign * added.length;
  const retained = Math.sign(previous) === sign ? added.length : 0;
  const cancelled = keySignatureLetters(previous).slice(retained);
  if (naturals && naturals !== cancelled.length) return null;
  const letters = [...(naturals ? cancelled : []), ...keySignatureLetters(fifths)];
  return marks.every((mark, i) => pitchAt(mark.y, staff, clef)?.letter === letters[i]) ? fifths : null;
}

/** Both piano staves print the key before their first rhythmic symbol. An accidental
 * adjacent to a note belongs to that note, even when it begins a system. */
export function museScoreKey(rows: PdfGlyph[][], measure: Measure, current: readonly Clef[], previous: number, systemStart = false) {
  const marks = rows.map((row, i) => {
    const staff = measure.staves[i]!;
    const glyphs = sortedX(row);
    const first = glyphs.find(g => (code(g) >= WHOLE && code(g) <= BLACK)
      || (code(g) >= 0xe4e3 && code(g) <= 0xe4e8));
    const digit = glyphs.find(g => code(g) >= 0xe080 && code(g) <= 0xe08b);
    const accidentals = glyphs.filter(g => code(g) >= FLAT && code(g) <= FLAT + 4
      && within(g.size, staff.space * 4, staff.space * 0.3)
      && g.x < (first?.x ?? Infinity));
    if (digit && digit.x < (first?.x ?? Infinity)) return accidentals.filter(g => g.x < digit.x);
    if (!first) return [];
    // Dense chords stagger their accidentals in columns. Follow the cluster
    // away from the heads while each sign still has a head on its staff step.
    const chord = glyphs.filter(g => code(g) >= WHOLE && code(g) <= BLACK && within(g.x, first.x, staff.space * 1.4));
    let edge = first.x;
    let count = accidentals.length;
    while (count) {
      const g = accidentals[count - 1]!;
      if (edge - g.x >= staff.space * (edge === first.x ? 2.2 : 1.45)
        || !chord.some(head => within(head.y, g.y, staff.space * 0.09))) break;
      edge = g.x;
      count--;
    }
    return accidentals.slice(0, count).filter(g => first.x - g.x >= staff.space * 2.2);
  });
  const [upper, lower] = marks;
  if (!upper!.length && !lower!.length) {
    const bareClefs = systemStart && rows.every((row, i) => row.some(g => printedClef(code(g))
      && within(g.size, measure.staves[i]!.space * 4, measure.staves[i]!.space * 0.3)));
    return { fifths: bareClefs ? 0 : previous, marks };
  }
  if (upper!.length !== lower!.length || upper!.some((g, i) => code(g) !== code(lower![i]!)
    || !within(g.x, lower![i]!.x, measure.staves[0].space * 0.25))) return null;
  const keys = marks.map((symbols, i) => {
    const clefMark = sortedX(rows[i]!).filter(g => printedClef(code(g)) && g.x < symbols[0]!.x).at(-1);
    const clef = clefMark ? printedClef(code(clefMark))!.clef : current[i]!;
    return signatureFifths(symbols, previous, measure.staves[i]!, clef);
  });
  const fifths = keys[0];
  return fifths == null || fifths !== keys[1] ? null : { fifths, marks };
}
