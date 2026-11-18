import type { PdfGeometry, PdfPoint } from './geometry';
import { musicGlyphCode } from './musicGlyphs';
import { rulings, top, type Measure } from './pianoGeometry';

/** Count the contiguous piano bars before an unpaired staff or an attack outside the paired staves. */
export function pianoCoverage(page: PdfGeometry, measures: readonly Measure[]): number | null {
  if (!measures.length) return 0;
  const attacks = page.glyphs.filter(g => {
    const code = musicGlyphCode(g);
    return (code >= 0xe0a0 && code <= 0xe0af) || (code >= 0xe4e3 && code <= 0xe4ef);
  });
  const unassigned: PdfPoint[] = [];
  for (const staff of rulings(page.segments)) {
    if (measures.some(m => m.left === staff.left && m.right === staff.right
      && m.staves.some(s => s.bottom === staff.bottom))) continue;
    if (attacks.some(g => g.x >= staff.left && g.x < staff.right
      && g.y >= staff.bottom - staff.space * 5 && g.y <= top(staff) + staff.space * 5)) {
      unassigned.push({ x: staff.left, y: top(staff) });
    }
  }
  for (const g of attacks) {
    if (!measures.some(m => g.x >= m.left && g.x < m.right
      && g.y >= m.staves[1].bottom - m.staves[1].space * 8
      && g.y <= top(m.staves[0]) + m.staves[0].space * 8)) unassigned.push(g);
  }
  if (!unassigned.length) return null;
  return unassigned.reduce((limit, point) => Math.min(limit, measures.filter(m => {
    const below = m.staves[1].bottom - m.staves[1].space * 5;
    const above = top(m.staves[0]) + m.staves[0].space * 5;
    return point.y < below || (point.y <= above && m.right <= point.x);
  }).length), measures.length);
}
