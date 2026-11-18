import type { Notation } from '../../../domain/notation/notation';
import type { PdfGlyph } from './geometry';
import { musicGlyphCode } from './musicGlyphs';
import type { MuseScoreDirectionBar } from './museScoreDirections';
import { sortedX, within } from './pianoGeometry';

interface Anchor {
  readonly index: number;
  readonly beat: number;
}

function pedalAnchor(notation: Notation, system: readonly MuseScoreDirectionBar[], x: number, closing: boolean): Anchor {
  const entry = system.find(bar => x < bar.measure.right) ?? system.at(-1)!;
  const bar = notation.bars[entry.index]!;
  const space = entry.measure.staves[0].space;
  const columns = entry.columns?.length ? entry.columns : entry.notes.map(note =>
    ({ x: note.columnX ?? note.x, beat: note.note.beat }));
  const lastX = Math.max(...columns.map(column => column.x));
  if (closing && (x >= entry.measure.right - space * 1.75 || (columns.length && x > lastX + space))) {
    return { index: entry.index, beat: bar.start + bar.length };
  }
  const closest = columns.reduce<(typeof columns)[number] | null>((best, column) =>
    !best || Math.abs(column.x - x) < Math.abs(best.x - x) ? column : best, null);
  return { index: entry.index, beat: closest?.beat ?? bar.start };
}

function parenthesized(sign: PdfGlyph, glyphs: readonly PdfGlyph[], space: number): boolean {
  const beside = (text: string, offset: number) => glyphs.some(glyph => glyph.text === text
    && within(glyph.x - sign.x, offset * space, space * 0.18) && within(glyph.y, sign.y, space * 0.1));
  return beside('(', -0.8) && beside(')', 3.9);
}

/** Read sustain brackets, joining the continuation marked (Ped.) across a system break. */
export function readMuseScorePedals(
  notation: Notation,
  systems: readonly (readonly MuseScoreDirectionBar[])[],
): Pick<Notation, 'pedalMarks' | 'pedalMoves'> {
  const pedalMarks: Notation['pedalMarks'][number][] = [];
  const pedalMoves: Notation['pedalMoves'][number][] = [];
  let open: Anchor | undefined;
  for (const system of systems) {
    const { geometry, measure } = system[0]!;
    const lower = measure.staves[1];
    const { space } = lower;
    const right = system.at(-1)!.measure.right;
    const signs = sortedX(geometry.glyphs.filter(glyph => musicGlyphCode(glyph) === 0xe650
      && glyph.x >= measure.left - space && glyph.x <= right
      && glyph.y < lower.bottom - space && glyph.y > lower.bottom - space * 12));
    const rails = geometry.segments.filter(rail => rail.x2 - rail.x1 > space
      && within(rail.y1, rail.y2, space * 0.04)
      && rail.x1 >= measure.left && rail.x2 <= right + space * 0.1
      && rail.y1 < lower.bottom - space && rail.y1 > lower.bottom - space * 12);
    for (const sign of signs) {
      const continuation = parenthesized(sign, geometry.glyphs, space);
      const rail = rails.find(line => within(line.x1 - sign.x, space * (continuation ? 5.14 : 4.45), space * 0.3)
        && within(line.y1, sign.y, space * 0.16));
      if (!rail) continue;
      if (!continuation) open = pedalAnchor(notation, system, sign.x, false);
      const hook = geometry.segments.some(line => within(line.x1, rail.x2, space * 0.08)
        && within(line.x2, rail.x2, space * 0.08)
        && within(Math.min(line.y1, line.y2), rail.y1, space * 0.08)
        && within(Math.abs(line.y2 - line.y1), space * 1.2, space * 0.18));
      if (!hook) {
        if (rail.x2 < right - space) open = undefined;
        continue;
      }
      if (!open) continue;
      const stop = pedalAnchor(notation, system, rail.x2, true);
      if (stop.beat > open.beat) {
        pedalMarks.push({ beat: open.beat, pedal: 'sustain', sign: true, line: true, type: 'start' },
          { beat: stop.beat, pedal: 'sustain', sign: false, line: true, type: 'stop' });
        pedalMoves.push({ beat: open.beat, bar: open.index, pedal: 'sustain', down: true },
          { beat: stop.beat, bar: stop.index, pedal: 'sustain', down: false });
      }
      open = undefined;
    }
  }
  return { pedalMarks, pedalMoves };
}
