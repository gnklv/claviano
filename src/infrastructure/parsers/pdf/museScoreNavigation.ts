import type { BarNavigation } from '../../../domain/notation/navigation';
import type { Notation } from '../../../domain/notation/notation';
import type { OctaveShift } from '../../../domain/score';
import type { PdfSegment } from './geometry';
import { isLegacyMusicGlyph, musicGlyphCode } from './musicGlyphs';
import type { MuseScoreDirectionBar } from './museScoreDirections';
import { sortedX, top, within } from './pianoGeometry';

const REPEAT_DOT = 0xe044;
const OTTAVA = 0xe510;
type MutableNavigation = { -readonly [K in keyof BarNavigation]: BarNavigation[K] };

function sameSystem(a: MuseScoreDirectionBar, b: MuseScoreDirectionBar): boolean {
  return a.geometry === b.geometry && within(a.measure.staves[0].bottom, b.measure.staves[0].bottom, 0.04);
}

function repeatDots(bar: MuseScoreDirectionBar): { start: number[]; end: boolean } {
  const { geometry, measure } = bar;
  const [upper] = measure.staves;
  const { space } = upper;
  const close = (a: number, b: number) => within(a, b, space * 0.12);
  const dots = geometry.glyphs.filter(g => g.x >= measure.left && g.x < measure.right && musicGlyphCode(g) === REPEAT_DOT);
  const barLines = geometry.segments.filter(line => close(line.x1, line.x2)
    && close(Math.max(line.y1, line.y2), top(upper))
    && Math.min(line.y1, line.y2) <= upper.bottom + space * 0.15);
  const result = { start: [] as number[], end: false };
  for (const x of new Set(dots.map(dot => dot.x))) {
    const group = dots.filter(dot => close(dot.x, x));
    if (!measure.staves.every(staff => [1, 2].every(row => group.some(dot =>
      close(dot.y, staff.bottom + (row + (isLegacyMusicGlyph(dot) ? 0 : 0.5)) * staff.space))))) continue;
    const nearby = barLines.filter(line => within(line.x1, x, space * 1.8));
    const thick = nearby.find(line => line.width > space * 0.35);
    const thin = nearby.find(line => line.width < space * 0.3);
    if (!thick || !thin || !within(thick.x1, thin.x1, space)) continue;
    if (thick.x1 < x && thin.x1 < x) result.start.push(x);
    if (thick.x1 > x && nearby.some(line => line.x1 > x && line.width < space * 0.3)) result.end = true;
  }
  return result;
}

interface Ending {
  readonly label: string;
  readonly numbers: readonly number[];
  readonly height: number;
  readonly rail: PdfSegment;
}

function horizontalAbove({ measure, geometry }: MuseScoreDirectionBar): PdfSegment[] {
  const upper = measure.staves[0];
  return geometry.segments.filter(line =>
    within(line.y1, line.y2, upper.space * 0.02)
    && line.y1 > top(upper) && line.y1 < top(upper) + upper.space * 10
    && Math.abs(line.x2 - line.x1) > upper.space * 3);
}

function voltaHook(bar: MuseScoreDirectionBar, x: number, y: number): PdfSegment | undefined {
  const { space } = bar.measure.staves[0];
  return bar.geometry.segments.find(line =>
    within(line.x1, x, space * 0.08) && within(line.x2, x, space * 0.08)
    && within(Math.max(line.y1, line.y2), y, space * 0.08)
    && within(Math.abs(line.y2 - line.y1), space * 2.2, space * 0.2));
}

function beginningOfEnding(bar: MuseScoreDirectionBar): Ending | undefined {
  const { measure, geometry } = bar;
  const upper = measure.staves[0];
  const { space } = upper;
  for (const rail of horizontalAbove(bar)) {
    const x = Math.min(rail.x1, rail.x2);
    if (!within(x, measure.left, space * 0.7)) continue;
    const hook = voltaHook(bar, x, rail.y1);
    if (!hook) continue;
    const y = Math.min(hook.y1, hook.y2);
    const label = sortedX(geometry.glyphs.filter(g => /Bold$/.test(g.font)
      && within(g.y, y, space * 0.12) && g.x > x && g.x < x + space * 5))
      .map(g => g.text).join('').trim();
    const numbers = label.match(/\d+/g)?.map(Number);
    if (numbers && /^\d+(?:,\s*\d+)*\.$/.test(label)) {
      return { label, numbers, height: rail.y1 - top(upper), rail };
    }
  }
  return undefined;
}

function continuedEnding(bar: MuseScoreDirectionBar, height: number): PdfSegment | undefined {
  const upper = bar.measure.staves[0];
  return horizontalAbove(bar).filter(rail => within(rail.y1 - top(upper), height, upper.space * 0.3)
    && Math.min(rail.x1, rail.x2) >= bar.measure.left
    && Math.min(rail.x1, rail.x2) < bar.measure.right)
    .sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2))[0];
}

function applyEndings(bars: readonly MuseScoreDirectionBar[], navigation: MutableNavigation[]): void {
  let active: Ending | undefined;
  for (const [position, bar] of bars.entries()) {
    const nav = navigation[bar.index];
    if (!nav) continue;
    const started = beginningOfEnding(bar);
    const previous = bars[position - 1];
    const next = bars[position + 1];
    if (started) {
      active = started;
      nav.endingLabel = started.label;
    } else if (active && previous && !sameSystem(previous, bar)) {
      const rail = continuedEnding(bar, active.height);
      if (!rail) {
        const end = navigation[previous.index];
        if (end) end.endingClosed = false;
      }
      active = rail ? { ...active, rail } : undefined;
    }
    if (!active) continue;
    nav.ending = active.numbers;
    const upper = bar.measure.staves[0];
    const endpoint = Math.max(active.rail.x1, active.rail.x2);
    if (endpoint > bar.measure.right + upper.space * 0.1) continue;
    const closed = !!voltaHook(bar, endpoint, active.rail.y1);
    if (closed || !next || sameSystem(bar, next) || endpoint < bar.measure.right - upper.space) {
      nav.endingClosed = closed;
      active = undefined;
    }
  }
}

function readOctaves(bar: MuseScoreDirectionBar): OctaveShift[] {
  const { geometry, measure, notes } = bar;
  const [upper, lower] = measure.staves;
  const { space } = upper;
  return geometry.glyphs.flatMap(glyph => {
    if (musicGlyphCode(glyph) !== OTTAVA || glyph.x < measure.left || glyph.x >= measure.right) return [];
    const octaves = within(glyph.y - top(upper), space * 2, space * 1.5) ? 1
      : within(lower.bottom - glyph.y, space * 2, space * 1.5) ? -1 : 0;
    if (!octaves) return [];
    const rails = geometry.segments.filter(rail => within(rail.y1, rail.y2, space * 0.03)
      && within(rail.y1 - glyph.y, (octaves > 0 ? 1.56 : 0) * space, space * 0.2)
      && within(Math.min(rail.x1, rail.x2) - glyph.x, space * 1.75, space * 0.2)
      && Math.max(rail.x1, rail.x2) <= measure.right);
    const rail = rails.find(line => {
      const endpoint = Math.max(line.x1, line.x2);
      return geometry.segments.some(hook => within(hook.x1, endpoint, space * 0.1)
        && within(hook.x2, endpoint, space * 0.1)
        && within((hook.y1 + hook.y2) / 2, line.y1 - octaves * space / 2, space * 0.1)
        && within(Math.abs(hook.y1 - hook.y2), space, space * 0.2));
    });
    if (!rail) return [];
    const staff = octaves > 0 ? 1 : 2;
    const endpoint = Math.max(rail.x1, rail.x2);
    const covered = notes.filter(n => n.note.staff === staff
      && (n.columnX ?? n.x) >= glyph.x - space * 0.15 && (n.columnX ?? n.x) < endpoint);
    if (!covered.length) return [];
    const start = Math.min(...covered.map(n => n.note.beat));
    const end = Math.max(...covered.map(n => n.note.beat + n.note.beats));
    return [{ staff, start, end, octaves }];
  });
}

/** Connect printed repeat signs and voltas, then apply the written octave lines. */
export function applyMuseScoreNavigation(notation: Notation, bars: readonly MuseScoreDirectionBar[]): Notation {
  const navigation: MutableNavigation[] = notation.bars.map(bar => ({ ...bar.navigation }));
  for (const [position, bar] of bars.entries()) {
    const repeat = repeatDots(bar);
    const nav = navigation[bar.index];
    if (repeat.end && nav) nav.repeatEnd = { times: 2 };
    for (const x of repeat.start) {
      const next = bars[position + 1];
      // MuseScore 2 can place the forward dots of a combined repeat just before the
      // next ruling starts, although they belong to that next measure in playback.
      const atRight = within(x, bar.measure.right, bar.measure.staves[0].space);
      const target = atRight && next && sameSystem(bar, next) ? navigation[next.index] : nav;
      if (target) target.repeatStart = true;
    }
  }
  applyEndings(bars, navigation);
  const detected = bars.flatMap(readOctaves);
  const octaveShifts = [...notation.octaveShifts, ...detected];
  const notes = notation.notes.map(note => {
    const shift = detected.find(mark => mark.staff === note.staff && note.beat >= mark.start && note.beat < mark.end);
    return shift ? { ...note, sounding: note.sounding + shift.octaves * 12 } : note;
  });
  return { ...notation, bars: notation.bars.map((bar, index) => ({ ...bar, navigation: navigation[index]! })), notes, octaveShifts };
}
