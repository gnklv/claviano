import type { Notation } from '../../../domain/notation/notation';
import type { PdfGeometry } from './geometry';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { top, within } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

interface PositionedBar {
  geometry: PdfGeometry;
  measure: LilyPondMeasure;
  notes: TimedNote[];
}

/** A textual 8va starts over its first notehead. Its rail starts after the
 * label and can cross a barline before ending in a downward hook. */
export function lilyPondOctaveShifts(bars: PositionedBar[]): Notation['octaveShifts'] {
  const shifts: Notation['octaveShifts'][number][] = [];
  for (const { geometry, measure } of bars) {
    const staff = measure.staves[0]!, space = staff.space;
    const glyphs = geometry.glyphs;
    for (const [i, sign] of glyphs.entries()) {
      if (sign.text !== '8' || sign.x < measure.left || sign.x >= measure.right
        || sign.y <= top(staff) || sign.y > top(staff) + 10 * space) continue;
      const suffix = glyphs.slice(i + 1, i + 3);
      if (suffix.map(g => g.text).join('') !== 'va' || suffix.some(g => g.textObject !== sign.textObject
        || g.font !== sign.font || !within(g.y, sign.y, .05 * space))) continue;
      const last = suffix[1]!;
      const rails = geometry.segments.filter(s => s.x1 > last.x && s.x1 < last.x + 2 * space
        && s.x2 > s.x1 && within(s.y1, s.y2, .05 * space)
        && s.y1 >= sign.y && s.y1 < sign.y + space);
      if (rails.length !== 1) continue;
      const rail = rails[0]!;
      const hooked = geometry.segments.some(s => within(s.x1, rail.x2, .05 * space)
        && within(s.x1, s.x2, .05 * space) && within(s.y1, rail.y1, .05 * space)
        && s.y1 - s.y2 >= .5 * space && s.y1 - s.y2 <= 2 * space);
      if (!hooked) continue;
      const covered = bars.filter(b => b.geometry === geometry && b.measure.staves[0]!.bottom === staff.bottom)
        .flatMap(b => b.notes).filter(n => n.note.staff === 1 && n.x >= sign.x - .35 * space && n.x < rail.x2);
      if (!covered.some(n => within(n.x, sign.x, .35 * space))) continue;
      shifts.push({ staff: 1, octaves: 1, start: Math.min(...covered.map(n => n.note.beat)),
        end: Math.max(...covered.map(n => n.note.beat + n.note.beats)) });
    }
  }
  return shifts;
}
