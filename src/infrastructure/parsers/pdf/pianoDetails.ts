import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import { codePoint, isHead, top, within, type Measure } from './pianoGeometry';
import { isGraceGlyph } from './pianoGraces';
import type { TimedNote } from './pianoNotes';

export const isNoteParenthesis = (glyph: PdfGlyph) => [0xe26a, 0xe26b].includes(codePoint(glyph));

/** Reduced, downward stems in an independent voice coincide with full-size attacks. */
export function timedCueGlyphs(glyphs: readonly PdfGlyph[], measure: Measure, segments: readonly PdfSegment[]): Set<PdfGlyph> {
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  const space = upper.space;
  const cue = new Set<PdfGlyph>();
  for (const [i] of measure.staves.entries()) {
    const staffGlyphs = glyphs.filter(g => (g.y > middle) === (i === 0));
    const reduced = staffGlyphs.filter(g => isGraceGlyph(g, space));
    const heads = reduced.filter(isHead);
    const principal = staffGlyphs.filter(g => isHead(g) && !reduced.includes(g));
    if (!heads.some(h => principal.some(p => within(p.x, h.x, space * 0.15)))) continue;
    if (heads.every(h => segments.some(s => within(s.x1, h.x + space * 0.05, space * 0.08)
      && within(s.x1, s.x2, space * 0.03) && Math.min(s.y1, s.y2) < h.y - space * 1.5
      && Math.max(s.y1, s.y2) >= h.y - space * 0.2))) {
      for (const g of reduced) cue.add(g);
    }
  }
  return cue;
}

export function readNoteDetails(geometry: PdfGeometry, measure: Measure, printed: readonly PdfGlyph[], positioned: readonly TimedNote[]) {
  const notes = [...positioned];
  const space = measure.staves[0].space;
  const parens = new Set(printed.filter(isNoteParenthesis));
  for (const left of parens) {
    if (codePoint(left) !== 0xe26a) continue;
    const found = notes.filter(n => within(n.x - left.x, space * 0.59, space * 0.12) && within(n.y, left.y, space * 0.1));
    const target = found[0];
    if (!target || found.length !== 1) return null;
    const right = [...parens].filter(g => codePoint(g) === 0xe26b && within(g.x - target.x, space * 1.18, space * 0.12)
      && within(g.y, target.y, space * 0.1));
    if (right.length !== 1) return null;
    notes[notes.indexOf(target)] = { ...target, note: { ...target.note, parenthesized: true } };
    parens.delete(left);
    parens.delete(right[0]!);
  }
  if (parens.size) return null;
  const readText = new Set<PdfGlyph>();
  const fingers = geometry.glyphs.filter(g => g.x > measure.left && g.x < measure.right
    && g.y > measure.staves[1].bottom - 4 * space && g.y < top(measure.staves[0]) + 6 * space
    && within(g.size, space * 1.68, space * 0.08) && /^[1-5-]$/.test(g.text));
  const middle = (measure.staves[0].bottom + top(measure.staves[1])) / 2;
  for (const entry of notes) {
    const chord = notes.filter(n => n.note.staff === entry.note.staff && within(n.x, entry.x, space * 0.1)).sort((a, b) => a.y - b.y);
    const marks = fingers.filter(g => (g.y > middle) === (entry.note.staff === 1)
      && within(g.x, entry.x + space * 0.25, space * 0.91)).sort((a, b) => a.y - b.y || a.x - b.x);
    if (!marks.length) continue;
    const rows: PdfGlyph[][] = [];
    for (const mark of marks) {
      if (!rows.length || !within(rows.at(-1)![0]!.y, mark.y, space * 0.08)) rows.push([]);
      rows.at(-1)!.push(mark);
    }
    const below = rows.every(row => row[0]!.y < chord[0]!.y);
    const above = rows.every(row => row[0]!.y > chord.at(-1)!.y);
    const row = rows[chord.indexOf(entry)];
    if (!row || rows.length !== chord.length || (!below && !above) || readText.has(row[0]!)
      || Math.abs(row[0]!.y - entry.y) > space * 4) return null;
    const text = row.map(g => g.text).join('');
    if (!/^[1-5](-[1-5])?$/.test(text)) return null;
    notes[notes.indexOf(entry)] = { ...entry, note: { ...entry.note, fingering: { text, below } } };
    for (const g of row) readText.add(g);
  }
  return { notes, readText };
}
