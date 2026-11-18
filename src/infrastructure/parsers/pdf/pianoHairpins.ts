import { SAME_MOMENT } from '../../../domain/moment';
import type { Notation } from '../../../domain/notation/notation';
import type { PdfGeometry } from './geometry';
import { top, within, type Measure } from './pianoGeometry';

interface Column {
  readonly x: number;
  readonly beat: number;
}

/** Recover wedges whose endpoints can be tied to the written timeline. */
export function readBarHairpins(
  geometry: PdfGeometry,
  measure: Measure,
  bar: Notation['bars'][number],
  columns: readonly Column[],
): Notation['hairpins'] | null {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const arms = geometry.segments.flatMap(segment => {
    const { x1, x2, y1, y2 } = segment;
    const arm = x1 < x2 ? segment : { ...segment, x1: x2, x2: x1, y1: y2, y2: y1 };
    if (arm.x1 >= measure.right || arm.x2 <= measure.left || arm.x2 - arm.x1 <= space
      || Math.abs(y2 - y1) <= space * 0.15) return [];
    const low = Math.min(y1, y2), high = Math.max(y1, y2);
    if (low > top(lower) && high < upper.bottom) return [{ arm, below: false }];
    if (high < lower.bottom && low > lower.bottom - space * 5) return [{ arm, below: true }];
    return [];
  });
  const beatAt = (x: number): number | undefined => {
    const matches = columns.filter(column => within(column.x, x, space * 0.25));
    const hit = matches[0];
    if (hit && matches.every(column => within(column.beat, hit.beat, SAME_MOMENT))) return hit.beat;
  };
  const output: Notation['hairpins'][number][] = [];
  const used = new Set<number>();
  for (const [i, { arm: a, below }] of arms.entries()) {
    for (let j = i + 1; j < arms.length; j++) {
      const { arm: b, below: otherBelow } = arms[j]!;
      if (below !== otherBelow || !within(a.x1, b.x1, space * 0.15) || !within(a.x2, b.x2, space * 0.15)
        || (a.y2 - a.y1) * (b.y2 - b.y1) >= 0) continue;
      const left = Math.abs(a.y1 - b.y1), right = Math.abs(a.y2 - b.y2);
      if (Math.min(left, right) >= space * 0.15 || Math.max(left, right) <= space * 0.4) continue;
      if (used.has(i) || used.has(j)) return null;
      used.add(i);
      used.add(j);
      const startX = (a.x1 + b.x1) / 2, endX = (a.x2 + b.x2) / 2;
      if (startX < measure.left || endX > measure.right) return null;
      const start = beatAt(startX);
      // Verovio can end the wedge just ahead of the barline after the final event.
      const atBarline = measure.right - endX <= space * 1.25
        && columns.every(column => endX - column.x > space * 0.25);
      const end = beatAt(endX) ?? (atBarline ? bar.start + bar.length : undefined);
      if (start === undefined || end === undefined || end - start <= SAME_MOMENT) return null;
      output.push({ start, end, below, type: left < right ? 'crescendo' : 'diminuendo', drawn: true });
    }
  }
  return output.sort((a, b) => a.start - b.start);
}
