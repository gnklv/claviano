import type { Notation } from '../../../domain/notation/notation';
import type { PdfGeometry } from './geometry';
import { codePoint, top, within, type Measure } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

export const OTTAVA = 0xe510;

/** Verovio prints the same ottava glyph above and below the staff. The inward
 * hook terminates over the last affected head, including its full duration. */
export function readBarOctaves(geometry: PdfGeometry, measure: Measure, timedNotes: readonly TimedNote[]) {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const octaveShifts: Notation['octaveShifts'][number][] = [];
  const hooks = geometry.segments.flatMap(s => {
    if (s.x1 <= measure.left || s.x1 >= measure.right || !within(s.x1, s.x2, space * 0.05)
      || !within(Math.abs(s.y1 - s.y2), space, space * 0.12)) return [];
    const low = Math.min(s.y1, s.y2), high = Math.max(s.y1, s.y2);
    if (high < lower.bottom - 8 * space || low > top(upper) + 8 * space) return [];
    // Filled pedal ticks are also stroked in some PDFs. Their long edges
    // have the same dimensions as an octave hook.
    if (geometry.fills.some(points => points.length === 4
      && points.some(p => within(p.x, s.x1, space * 0.01) && within(p.y, low, space * 0.01))
      && points.some(p => within(p.x, s.x1, space * 0.01) && within(p.y, high, space * 0.01)))) return [];
    return geometry.segments.flatMap(h => {
      if (!within(h.y2, h.y1, space * 0.05) || !within(Math.max(h.x1, h.x2), s.x1, space * 0.05)
        || !within(Math.abs(h.x2 - h.x1), space * 0.5, space * 0.1)) return [];
      const octaves = within(h.y1, high, space * 0.06) ? 1 : within(h.y1, low, space * 0.06) ? -1 : 0;
      return octaves ? [{ x: s.x1, y: h.y1, octaves }] : [];
    });
  });
  const used = new Set<typeof hooks[number]>();
  for (const glyph of geometry.glyphs) {
    if (codePoint(glyph) !== OTTAVA || glyph.x <= measure.left || glyph.x >= measure.right
      || glyph.y < lower.bottom - 8 * space || glyph.y > top(upper) + 8 * space) continue;
    const candidates = hooks.filter(h => h.x > glyph.x
      && within(h.y, glyph.y + (h.octaves > 0 ? 1.85 : 0.05) * space, space * 0.12));
    if (candidates.length !== 1) return null;
    const hook = candidates[0]!;
    const { octaves } = hook;
    // A facing hook in the inter-system gap belongs to the neighbouring system.
    if ((octaves > 0 && glyph.y < lower.bottom) || (octaves < 0 && glyph.y > top(upper))) continue;
    if (used.has(hook) || (octaves > 0 ? glyph.y < top(upper) : glyph.y > lower.bottom)) return null;
    used.add(hook);
    const staff = octaves > 0 ? 1 : 2;
    const heads = timedNotes.filter(n => n.note.staff === staff);
    const first = heads.filter(n => within(n.x, glyph.x + space, space * 0.25));
    const last = heads.filter(n => within(n.x, hook.x - 1.8 * space, space * 0.3));
    if (!first.length || !last.length) return null;
    const start = first[0]!.note.beat;
    const end = Math.max(...last.map(n => n.note.beat + n.note.beats));
    if (end <= start || first.some(n => n.note.beat !== start) || last.some(n => n.note.beat !== last[0]!.note.beat)
      || octaveShifts.some(s => s.staff === staff && start < s.end && s.start < end)) return null;
    octaveShifts.push({ staff, start, end, octaves });
  }
  if (hooks.some(h => !used.has(h) && (h.octaves > 0 ? h.y > top(upper) : h.y < lower.bottom))) return null;
  const notes = timedNotes.map(n => {
    const shift = octaveShifts.find(s => n.note.staff === s.staff && n.note.beat >= s.start && n.note.beat < s.end);
    return shift ? { ...n, note: { ...n.note, sounding: n.note.sounding + 12 * shift.octaves } } : n;
  });
  return { notes, octaveShifts };
}
