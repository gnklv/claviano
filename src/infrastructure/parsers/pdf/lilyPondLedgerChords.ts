import type { PdfGlyph, PdfSegment } from './geometry';
import { lilyGraceSymbol } from './lilyPondGraces';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { attachHeads } from './pianoAttacks';
import { center, isHead, within, type Staff } from './pianoGeometry';

/** A chord that straddles the gap still has one printed stem. Use the
 * line/space positions of its heads when they identify just one staff. */
export function ledgerChordStaff(glyphs: PdfGlyph[], stems: PdfSegment[], measure: LilyPondMeasure,
  nearby: Staff[] = [...measure.staves]) {
  const owners = new Map<PdfGlyph, Staff>();
  const staves = [...new Set(nearby)].sort((a, b) => b.bottom - a.bottom);
  for (let i = 1; i < staves.length; i++) {
    const upper = staves[i - 1]!, lower = staves[i]!;
    if (!measure.staves.includes(upper) && !measure.staves.includes(lower)) continue;
    assignChordHeads(upper, lower, glyphs, stems, measure, owners);
  }
  return owners;
}

function assignChordHeads(upper: Staff, lower: Staff, glyphs: PdfGlyph[], stems: PdfSegment[],
  measure: LilyPondMeasure, owners: Map<PdfGlyph, Staff>) {
  const space = upper.space;
  const heads = glyphs.filter(g => isHead(g) && g.y >= lower.bottom && g.y <= upper.bottom + 4 * space
    && !lilyGraceSymbol(g, space));
  const midpoint = (center(upper) + center(lower)) / 2;
  const localStems = stems.filter(s => s.x1 > measure.left && s.x1 < measure.right
    && s.y1 < midpoint + space && s.y2 > midpoint - space);
  for (const { heads: chord } of attachHeads(heads, localStems, space)) {
    const crossesGap = chord.some(h => h.y > midpoint) && chord.some(h => h.y < midpoint);
    if (!crossesGap && !chord.some(h => within(h.y, midpoint, 2 * space))) continue;
    const matches = [upper, lower].filter(staff => chord.every(h => {
      const steps = 2 * (h.y - staff.bottom) / staff.space;
      return within(steps, Math.round(steps), .06);
    }));
    if (matches.length === 1) for (const head of chord) owners.set(head, matches[0]!);
  }
}
