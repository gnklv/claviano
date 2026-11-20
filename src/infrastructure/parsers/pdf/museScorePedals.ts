import type { Notation } from '../../../domain/notation/notation';
import type { PdfGlyph } from './geometry';
import { musicGlyphCode } from './musicGlyphs';
import type { MuseScoreDirectionBar } from './museScoreDirections';
import { sortedX, within } from './pianoGeometry';

interface Anchor {
  readonly index: number;
  readonly beat: number;
}

interface BeatColumn {
  readonly x: number;
  readonly beat: number;
}

function unsignedReleaseBeat(entry: MuseScoreDirectionBar, columns: readonly BeatColumn[], x: number,
  closest: BeatColumn | null, barEnd: number): number | undefined {
  const space = entry.measure.staves[1].space;
  // The hook is printed under the bass staff. An intervening treble-only
  // attack can be closer on paper than the bass attack that changes the pedal.
  const bass = sortedX(entry.notes.filter(({ note }) => note.staff === 2)
    .map(({ x, columnX, note }) => ({ x: columnX ?? x, note })));
  if (!bass.some(({ note }) => note.beat === closest?.beat)) {
    const preceding = bass.filter(point => point.x <= x).at(-1);
    const following = bass.find(point => point.x > x);
    if (preceding && following && x - preceding.x > space * 1.1
      && following.x - x >= space * 1.25 && following.x - x <= space * 2.15) return following.note.beat;
    if (preceding && !following && preceding.note.beat + preceding.note.beats === barEnd
      && x - preceding.x > space * 1.75 && entry.measure.right - x <= space * 3.5) return barEnd;
  }
  // An unsigned release hook reserves space before the next head. When
  // the hook stands in open space between evenly spaced quarter beats,
  // the release may instead fall on the unwritten eighth between them.
  const points = [...columns, { x: entry.measure.right, beat: barEnd }];
  const before = points.filter(p => p.x <= x).sort((a, b) => b.x - a.x)[0];
  const after = points.filter(p => p.x > x).sort((a, b) => a.x - b.x)[0];
  if (before && after) {
    const left = (x - before.x) / space, right = (after.x - x) / space;
    if (right <= 1.3 && left >= 1.1) return after.beat;
    const width = after.x - before.x;
    const evenQuarters = points.some(p =>
      (p.beat === before.beat - 1 && within(before.x - p.x, width, width * 0.15))
      || (p.beat === after.beat + 1 && within(p.x - after.x, width, width * 0.15)));
    if (after.beat - before.beat === 1 && evenQuarters && Math.min(left, right) > 1.5
      && Math.abs(left - right) / (left + right) < 0.2) {
      return before.beat + 0.5;
    }
  }
  return undefined;
}

function pedalAnchor(notation: Notation, system: readonly MuseScoreDirectionBar[], x: number, endpoint: 'start' | 'stop' | 'unsignedStop'): Anchor {
  const entry = system.find(bar => x < bar.measure.right) ?? system.at(-1)!;
  const bar = notation.bars[entry.index]!;
  const space = entry.measure.staves[0].space;
  const columns = entry.columns?.length ? entry.columns : entry.notes.map(note =>
    ({ x: note.columnX ?? note.x, beat: note.note.beat }));
  const closest = columns.reduce<(typeof columns)[number] | null>((best, column) =>
    !best || Math.abs(column.x - x) < Math.abs(best.x - x) ? column : best, null);
  if (endpoint === 'unsignedStop') {
    const release = unsignedReleaseBeat(entry, columns, x, closest, bar.start + bar.length);
    if (release !== undefined) return { index: entry.index, beat: release };
  }
  const lastX = Math.max(...columns.map(column => column.x));
  if (endpoint !== 'start' && (x >= entry.measure.right - space * 1.75 || (columns.length && x > lastX + space))) {
    return { index: entry.index, beat: bar.start + bar.length };
  }
  return { index: entry.index, beat: closest?.beat ?? bar.start };
}

function releaseStarAnchor(notation: Notation, system: readonly MuseScoreDirectionBar[], release: PdfGlyph): Anchor {
  const entry = system.find(bar => release.x < bar.measure.right) ?? system.at(-1)!;
  const bar = notation.bars[entry.index]!;
  const { space } = entry.measure.staves[1];
  // A star centered under a lower-staff note or rest refers to its release.
  const aligned = (x: number) => within(release.x - x, space * 0.63, space * 0.04);
  const ends = new Set<number>();
  for (const { x, columnX, note } of entry.notes) {
    if (note.staff === 2 && aligned(columnX ?? x)) ends.add(note.beat + note.beats);
  }
  for (const { x, beat, rest } of entry.columns ?? []) {
    if (rest?.staff === 2 && aligned(x)) ends.add(beat + rest.beats);
  }
  const end = ends.size === 1 ? ends.values().next().value : undefined;
  return end === undefined ? pedalAnchor(notation, system, release.x, 'stop')
    : { index: entry.index, beat: Math.min(end, bar.start + bar.length) };
}

function closingParenthesis(sign: PdfGlyph, glyphs: readonly PdfGlyph[], space: number): PdfGlyph | undefined {
  const sameRow = (glyph: PdfGlyph) => within(glyph.y, sign.y, space * 0.1);
  if (!glyphs.some(glyph => glyph.text === '(' && sameRow(glyph)
    && within(sign.x - glyph.x, space * 0.8, space * 0.18))) return undefined;
  return glyphs.find(glyph => glyph.text === ')' && sameRow(glyph)
    && glyph.x > sign.x + space * 2.9 && glyph.x < sign.x + space * 4.1);
}

/** Read sustain brackets, joining the continuation marked (Ped.) across a system break. */
export function readMuseScorePedals(
  notation: Notation,
  systems: readonly (readonly MuseScoreDirectionBar[])[],
): Pick<Notation, 'pedalMarks' | 'pedalMoves'> {
  const pedalMarks: Notation['pedalMarks'][number][] = [];
  const pedalMoves: Notation['pedalMoves'][number][] = [];
  function addSpan(start: Anchor, stop: Anchor, sign: boolean, line: boolean) {
    if (stop.beat <= start.beat) return;
    pedalMarks.push({ beat: start.beat, pedal: 'sustain', sign, line, type: 'start' },
      { beat: stop.beat, pedal: 'sustain', sign: !line, line, type: 'stop' });
    pedalMoves.push({ beat: start.beat, bar: start.index, pedal: 'sustain', down: true },
      { beat: stop.beat, bar: stop.index, pedal: 'sustain', down: false });
  }
  let open: Anchor | undefined;
  let pendingSign: Anchor | undefined;
  for (const system of systems) {
    const previousSign = pendingSign;
    pendingSign = undefined;
    const { geometry, measure } = system[0]!;
    const lower = measure.staves[1];
    const { space } = lower;
    const right = system.at(-1)!.measure.right;
    const signs = sortedX(geometry.glyphs.filter(glyph => musicGlyphCode(glyph) === 0xe650
      && glyph.x >= measure.left - space && glyph.x <= right
      && glyph.y < lower.bottom - space && glyph.y > lower.bottom - space * 12));
    const rails = geometry.segments.filter(rail => rail.x2 > rail.x1
      && within(rail.y1, rail.y2, space * 0.04)
      && rail.x1 >= measure.left && rail.x2 <= right + space * 0.1
      && rail.y1 < lower.bottom - space && rail.y1 > lower.bottom - space * 12);
    const hasHook = (x: number, y: number) => geometry.segments.some(line => within(line.x1, x, space * 0.08)
      && within(line.x2, x, space * 0.08)
      && within(Math.min(line.y1, line.y2), y, space * 0.08)
      && (within(Math.abs(line.y2 - line.y1), space * 1.2, space * 0.18)
        || within(Math.abs(line.y2 - line.y1), space * 1.5, space * 0.08)));
    for (const rail of rails) {
      if (rail.x2 - rail.x1 > space && hasHook(rail.x1, rail.y1) && hasHook(rail.x2, rail.y2)) {
        addSpan(pedalAnchor(notation, system, rail.x1, 'start'), pedalAnchor(notation, system, rail.x2, 'unsignedStop'), false, true);
      }
    }
    for (const [index, sign] of signs.entries()) {
      const continuation = closingParenthesis(sign, geometry.glyphs, space);
      // In a compact measure the text can occupy almost all of a short
      // bracket. A closing hook confirms even a sub-space horizontal line.
      const rail = rails.find(line => (line.x2 - line.x1 > space || hasHook(line.x2, line.y2))
        && (continuation ? within(line.x1 - continuation.x, space * 1.27, space * 0.3)
        : [3.65, 4.45].some(width => within(line.x1 - sign.x, space * width, space * 0.3)))
        && within(line.y1, sign.y, space * 0.16));
      if (!rail) {
        const release = geometry.glyphs.find(glyph => musicGlyphCode(glyph) === 0xe655
          && glyph.x > sign.x && glyph.x < (signs[index + 1]?.x ?? right)
          && within(glyph.y, sign.y, space * 0.16));
        const start = continuation ? (index === 0 ? previousSign : undefined) : pedalAnchor(notation, system, sign.x, 'start');
        if (release && start) addSpan(start, releaseStarAnchor(notation, system, release), true, false);
        else if (!release && index === signs.length - 1) pendingSign = start;
        continue;
      }
      if (!continuation) open = pedalAnchor(notation, system, sign.x, 'start');
      if (!hasHook(rail.x2, rail.y2)) {
        if (rail.x2 < right - space) open = undefined;
        continue;
      }
      if (!open) continue;
      const stop = pedalAnchor(notation, system, rail.x2, 'stop');
      addSpan(open, stop, true, true);
      open = undefined;
    }
  }
  pedalMarks.sort((a, b) => a.beat - b.beat || Number(b.type === 'stop') - Number(a.type === 'stop'));
  pedalMoves.sort((a, b) => a.beat - b.beat || Number(a.down) - Number(b.down));
  return { pedalMarks, pedalMoves };
}
