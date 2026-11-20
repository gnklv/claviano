import { durationBeats } from '../../../domain/notation/noteValue';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { readPianoAttacks } from './pianoAttacks';
import { codePoint, DOT, type BeamStrip, type Staff, within } from './pianoGeometry';

/** LilyPond shifts a dot past an opposing stem, and can merge two voices onto
 * a single head while dotting only one of them. */
export function lilyPondAttacks(geometry: PdfGeometry, glyphs: PdfGlyph[], staff: Staff, beams: BeamStrip[], length: number) {
  const dots = glyphs.filter(g => codePoint(g) === DOT);
  const attacks = readPianoAttacks(geometry, glyphs.filter(g => codePoint(g) !== DOT), staff, beams, length);
  if (!attacks) return null;
  // Two flagged stems can share one printed head. Retain that head in the
  // engraving even when both voices qualify for a hidden duplicate.
  for (const attack of attacks) {
    const head = attack.hiddenHead;
    if (head && !attacks.some(other => other.hiddenHead !== head && other.heads.includes(head)))
      delete attack.hiddenHead;
  }
  if (!dots.length) return attacks;
  const { space } = staff;
  const groups = new Map<typeof attacks[number], PdfGlyph[]>();
  for (const dot of dots) {
    const candidates = attacks.flatMap(attack => {
      const heads = attack.rest ? [attack.rest] : attack.heads;
      const dx = (dot.x - Math.max(...heads.map(h => h.x))) / space;
      if (dx < 0.85 || dx > 4) return [];
      const dy = heads.reduce((best, head) => Math.abs(dot.y - head.y) < Math.abs(best) ? dot.y - head.y : best, Infinity) / space;
      if (Math.abs(dy) > 0.6) return [];
      const side = attack.stem && Math.abs(dy) > 0.25 && (dy > 0) !== attack.stem.up ? 1 : 0;
      return [{ attack, cost: Math.abs(dx - 1.8) + Math.abs(dy) + side }];
    }).sort((a, b) => a.cost - b.cost);
    if (!candidates[0]) return null;
    const attack = candidates[0].attack;
    const existing = groups.get(attack) ?? [];
    existing.push(dot);
    groups.set(attack, existing);
  }
  for (const [attack, marks] of groups) {
    const levels = marks.some(dot => marks.some(other => within(dot.y, other.y, space * 0.1)
      && other.x - dot.x > space * 0.4)) ? 2 : 1;
    attack.duration = { ...attack.duration, dots: levels };
    attack.beats = durationBeats(attack.duration) * (attack.triplet ? 2 / 3 : 1);
  }
  return attacks;
}
