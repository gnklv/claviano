import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { PdfGeometry, PdfPoint } from './geometry';
import { within, type Measure } from './pianoGeometry';

interface Rectangle {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface UnresolvedPedal {
  staff: 2;
  bar: number;
  start: number;
  end: number;
  kind: 'ambiguous-pedal';
}

interface Bracket {
  start: number;
  stop: number;
  y: number;
}

function rectangle(points: readonly PdfPoint[]): Rectangle | null {
  if (points.length !== 4) return null;
  const left = Math.min(...points.map(point => point.x));
  const right = Math.max(...points.map(point => point.x));
  const bottom = Math.min(...points.map(point => point.y));
  const top = Math.max(...points.map(point => point.y));
  if (left === right || bottom === top || !points.every(point =>
    (point.x === left || point.x === right) && (point.y === bottom || point.y === top))) return null;
  return { left, right, bottom, top };
}

/** An engraved pedal bracket has a narrow rail and upright ticks at its ends.
 * At a pedal change, the release and next press share one tick. */
export function readPedalLines(geometry: PdfGeometry, measure: Measure, bar: WrittenBar, barIndex: number,
  columns: readonly { x: number; beat: number }[], beatAt: (x: number) => number | undefined,
  ambiguousStart: (x: number) => boolean,
): {
  pedalMarks: Notation['pedalMarks'];
  pedalMoves: Notation['pedalMoves'];
  unresolvedPedals: UnresolvedPedal[];
  pedalContinues: boolean;
  pedalFromPrevious: boolean;
} | null {
  const lower = measure.staves[1];
  const space = lower.space;
  const same = (a: number, b: number) => within(a, b, space * 0.04);
  const rectangles = geometry.fills.map(rectangle).filter((r): r is Rectangle => r !== null
    && r.bottom < lower.bottom - 2.5 * space && r.bottom > lower.bottom - 8 * space);
  const tabs = rectangles.filter(r => within(r.top - r.bottom, space * 0.1, space * 0.04)
    && within(r.right - r.left, space * 0.5, space * 0.04));
  const ticks = rectangles.filter(r => within(r.right - r.left, space * 0.1, space * 0.04)
    && within(r.top - r.bottom, space, space * 0.08));
  const brackets: Bracket[] = [];
  for (const rail of rectangles) {
    if (rail.right - rail.left <= space || rail.right < measure.left - space || rail.left > measure.right + space
      || !within(rail.top - rail.bottom, space * 0.1, space * 0.04)) continue;
    const starts = tabs.filter(tab => same(tab.right, rail.left) && same(tab.bottom, rail.bottom))
      .flatMap(tab => ticks.filter(tick => same(tick.left, tab.left) && same(tick.bottom, rail.bottom)));
    const stops = tabs.filter(tab => same(tab.left, rail.right) && same(tab.bottom, rail.bottom))
      .flatMap(tab => ticks.filter(tick => same(tick.right, tab.right) && same(tick.bottom, rail.bottom)));
    const start = starts[0], stop = stops[0];
    if (!start && !stop) {
      // A rail with an end tab but no upright tick is incomplete.
      if (tabs.some(tab => same(tab.bottom, rail.bottom) && (same(tab.right, rail.left) || same(tab.left, rail.right)))) return null;
      continue;
    }
    if (!start || !stop || starts.some(tick => !same(tick.left, start.left))
      || stops.some(tick => !same(tick.left, stop.left))) return null;
    brackets.push({ start: start.left, stop: stop.left, y: rail.bottom });
  }
  const pedalMarks: Notation['pedalMarks'][number][] = [];
  const pedalMoves: Notation['pedalMoves'][number][] = [];
  let pedalContinues = false;
  let pedalFromPrevious = false;
  const append = (beat: number, type: 'start' | 'stop' | 'change') => {
    pedalMarks.push({ pedal: 'sustain', beat, type, sign: false, line: true });
    if (type !== 'start') pedalMoves.push({ bar: barIndex, pedal: 'sustain', beat, down: false });
    if (type !== 'stop') pedalMoves.push({ bar: barIndex, pedal: 'sustain', beat, down: true });
  };
  const inBar = (x: number) => x >= measure.left && x < measure.right;
  const unresolvedPedals: UnresolvedPedal[] = [];
  let ambiguous = false;
  brackets.sort((a, b) => a.start - b.start);
  for (const [i, bracket] of brackets.entries()) {
    const previous = brackets[i - 1], next = brackets[i + 1];
    const changeIn = previous && same(previous.stop, bracket.start) && same(previous.y, bracket.y);
    const changeOut = next && same(bracket.stop, next.start) && same(bracket.y, next.y);
    if (previous && previous.stop > bracket.start && !changeIn) return null;
    if (!changeIn) ambiguous = ambiguousStart(bracket.start);
    let startBeat: number | undefined;
    if (inBar(bracket.start)) {
      startBeat = beatAt(bracket.start);
      if (startBeat === undefined) return null;
      if (!ambiguous) append(startBeat, changeIn ? 'change' : 'start');
    }
    if (bracket.start < measure.right && bracket.stop > measure.right) pedalContinues = true;
    if (bracket.start < measure.left && bracket.stop > measure.left) pedalFromPrevious = true;
    let endBeat = bar.start + bar.length;
    if ((inBar(bracket.stop) || bracket.stop === measure.right) && bracket.stop > measure.left && (!changeOut || ambiguous)) {
      const atBarline = measure.right - bracket.stop <= space * 1.25
        && columns.every(column => bracket.stop - column.x > space * 0.25);
      const beat = beatAt(bracket.stop) ?? (atBarline ? bar.start + bar.length : undefined);
      if (beat === undefined || (startBeat !== undefined && beat <= startBeat)) return null;
      endBeat = beat;
      if (!ambiguous) append(beat, 'stop');
    }
    if (ambiguous && bracket.start < measure.right && bracket.stop > measure.left) {
      unresolvedPedals.push({ staff: 2, bar: barIndex, start: startBeat ?? bar.start, end: endBeat, kind: 'ambiguous-pedal' });
    }
  }
  return { pedalMarks, pedalMoves, unresolvedPedals, pedalContinues, pedalFromPrevious };
}
