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
    const nearby = barLines.filter(line => within(line.x1, x, space * 2.1));
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
    && Math.abs(line.y2 - line.y1) >= space * 1.7 && Math.abs(line.y2 - line.y1) <= space * 3.5);
}

function beginningOfEnding(bar: MuseScoreDirectionBar): Ending | undefined {
  const { measure, geometry } = bar;
  const upper = measure.staves[0];
  const { space } = upper;
  for (const rail of horizontalAbove(bar)) {
    const x = Math.min(rail.x1, rail.x2);
    const firstAttack = bar.columns?.length ? Math.min(...bar.columns.map(c => c.x)) : measure.left;
    if (x < measure.left - space * 0.7 || x > Math.max(measure.left + space * 0.7, firstAttack)) continue;
    const hook = voltaHook(bar, x, rail.y1);
    if (!hook) continue;
    const y = Math.min(hook.y1, hook.y2);
    const label = sortedX(geometry.glyphs.filter(g => /Bold$/.test(g.font)
      && within(g.y, y, space * 0.38) && g.x > x && g.x < x + space * 5))
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
      if (active && previous) navigation[previous.index]!.endingClosed = false;
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

/** MuseScore repeats the ottava sign on each new system. The rail ends at
 * the margin while the line continues, and has a vertical hook where it stops. */
function readOctaves(bars: readonly MuseScoreDirectionBar[], notation: Notation): OctaveShift[] {
  const shifts: OctaveShift[] = [];
  const open = new Map<number, OctaveShift>();
  for (let i = 0; i < bars.length;) {
    const first = bars[i]!;
    let end = i + 1;
    while (end < bars.length && sameSystem(first, bars[end]!)) end++;
    const system = bars.slice(i, end);
    i = end;
    const last = system.at(-1)!;
    const right = last.measure.right;
    const [upper, lower] = first.measure.staves;
    const space = upper.space;
    const { geometry } = first;
    const previous = new Map(open);
    open.clear();
    for (const sign of geometry.glyphs) {
      const code = musicGlyphCode(sign);
      const numeric = sign.text === '8' && /Italic/.test(sign.font);
      const suffix = numeric ? sortedX(geometry.glyphs.filter(g => g.font === sign.font
        && within(g.y, sign.y, space * 0.08) && g.x > sign.x && g.x < sign.x + space * 3.2)) : [];
      const va = suffix[0]?.text === 'v' && suffix[1]?.text === 'a' ? suffix[1] : undefined;
      const plainEight = numeric && (va || sign.font === 'FreeSerifItalic');
      if ((!plainEight && code !== OTTAVA && code !== 0xe511) || sign.x < first.measure.left || sign.x >= right) continue;
      const lowerAbove = sign.y - top(lower);
      const between = sign.y < upper.bottom && lowerAbove >= 0 && lowerAbove <= space * 6;
      const above = sign.y - top(upper), below = lower.bottom - sign.y;
      const octaves = above >= 0 && above <= space * 7 || between && (code === 0xe511 || previous.get(2)?.octaves === 1) ? 1
        : below >= 0 && below <= space * 7 && code !== 0xe511 ? -1 : 0;
      if (!octaves) continue;
      // A sign in the gap between systems can be above the next treble staff.
      if (octaves < 0 && bars.some(b => b.geometry === geometry && b.measure.left <= sign.x
        && b.measure.right > sign.x && sign.y >= top(b.measure.staves[0])
        && sign.y - top(b.measure.staves[0]) < below)) continue;
      const staff = above >= 0 && octaves > 0 ? 1 : 2;
      const rail = geometry.segments.find(s => within(s.y1, s.y2, space * 0.03)
        && (within(s.y1 - sign.y, space * 0.8, space * 0.2)
          || within(s.y1 - sign.y, octaves > 0 ? space * 1.56 : 0, space * 0.2))
        && (code === 0xe511 ? [3.9] : previous.has(staff) ? [1.75, 2.3] : [1.75]).some(offset =>
          within(Math.min(s.x1, s.x2) - (va?.x ?? sign.x), offset * space, space * 0.35))
        // The end hook can project into the margin past the final barline.
        && Math.max(s.x1, s.x2) <= right + space * 2);
      if (!rail) continue;
      const endpoint = Math.max(rail.x1, rail.x2);
      const hooked = geometry.segments.some(h => within(h.x1, endpoint, space * 0.12)
        && within(h.x2, endpoint, space * 0.12)
        && within(octaves > 0 ? Math.max(h.y1, h.y2) : Math.min(h.y1, h.y2), rail.y1, space * 0.12)
        && Math.abs(h.y1 - h.y2) >= space * 0.8 && Math.abs(h.y1 - h.y2) <= space * 2.2);
      if (!hooked && !within(endpoint, right, space * 0.55)) continue;
      const left = sign.x - space * (va ? 2.5 : 0.15);
      const underRail = (x: number) => x >= left && x < endpoint;
      const covered = system.flatMap(b => b.notes).filter(n => n.note.staff === staff && underRail(n.columnX ?? n.x));
      if (!covered.length) continue;
      const firstBar = system.find(b => sign.x < b.measure.right)!;
      const atOpening = firstBar.columns?.every(c => c.x >= left);
      const start = atOpening ? notation.bars[firstBar.index]!.start : Math.min(...covered.map(n => n.note.beat));
      const lastBar = notation.bars[last.index]!;
      const restEnds = system.flatMap(b => (b.columns ?? []).flatMap(c =>
        c.rest?.staff === staff && underRail(c.x) ? [c.beat + c.rest.beats] : []));
      const stop = hooked ? Math.max(...covered.map(n => n.note.beat + n.note.beats), ...restEnds) : lastBar.start + lastBar.length;
      const continued = previous.get(staff);
      const joins = continued?.octaves === octaves && within(continued.end, start, 1e-8);
      const shift = { staff, octaves, start: joins ? continued.start : start, end: stop };
      if (joins) shifts[shifts.indexOf(continued)] = shift;
      else shifts.push(shift);
      if (!hooked) open.set(staff, shift);
    }
  }
  return shifts;
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
  const detected = readOctaves(bars, notation);
  const octaveShifts = [...notation.octaveShifts, ...detected];
  function shiftSounding<T extends { staff: number; sounding: number }>(note: T, beat: number): T {
    const shift = detected.find(mark => mark.staff === note.staff && beat >= mark.start && beat < mark.end);
    return shift ? { ...note, sounding: note.sounding + shift.octaves * 12 } : note;
  }
  const notes = notation.notes.map(note => shiftSounding(note, note.beat));
  const graces = notation.graces.map(group => ({
    ...group, notes: group.notes.map(note => shiftSounding(note, group.beat)),
  }));
  return { ...notation, bars: notation.bars.map((bar, index) => ({ ...bar, navigation: navigation[index]! })), notes, graces, octaveShifts };
}
