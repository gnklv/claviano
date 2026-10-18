import { SAME_MOMENT } from '../moment';
/*
 * How wide a bar is drawn. Left to itself music is set out by its time: a bar of a given width,
 * each note as far along it as its beat is through the bar. But a note needs room of its own (its
 * head, its accidental before it, its dot after it), and where many stand close in time that
 * room is more than their time would give them: there the bar is let out, between those notes
 * only. A bar of long notes keeps its width; a run of thirty-seconds gets what it needs.
 *
 * Lengths are in staff spaces.
 */

/** What stands at one moment of a bar, on any staff: where in the bar, and the room it needs on each side of that place. */
export interface Column {
  /** How far through the bar its moment is, from 0 (its first beat) to 1. */
  readonly at: number;
  /** Room to the left of its place: accidentals, grace notes, the sign of a rolled chord. */
  readonly before: number;
  /** Room to the right: the head, a head moved over, dots, a flag. */
  readonly after: number;
}

/** A bar set out: where along it each of its moments stands, and how wide it is. */
export interface BarSpacing {
  /** Moments of the bar (`at`, from 0 to 1) and their places (`x`), both rising; the first is 0 at 0, the last the bar's whole width at 1. */
  readonly marks: readonly { readonly at: number; readonly x: number }[];
  readonly width: number;
}

/** Between what one column needs after it and what the next needs before it. */
const BETWEEN = 0.3;
/** After the last column, before the bar's end: the next bar's line stands there. */
const AT_END = 1.7;

/**
 * Sets out a bar: `natural` is its width where nothing is crowded (each moment then stands as far
 * along as its time). Between two neighbouring columns there is as much as their time gives, or
 * as much as they need, whichever is more.
 */
export function spaceBar(columns: readonly Column[], natural: number): BarSpacing {
  const sorted = merged(columns);
  const marks = [{ at: 0, x: 0 }];
  let x = 0;
  let from: Column = { at: 0, before: 0, after: 0 };
  for (const column of [...sorted, null]) {
    const at = column ? column.at : 1;
    if (at <= from.at) {
      // (Standing at the bar's first beat: nothing before it to keep away from.)
      if (column) from = column;
      continue;
    }
    const needed = column ? from.after + column.before + BETWEEN : from.after > 0 ? from.after + AT_END : 0;
    x += Math.max((at - from.at) * natural, needed);
    marks.push({ at, x });
    if (column) from = column;
  }
  return { marks, width: x };
}

/** Columns in order, those of one moment as one: with the most that any of them needs on each side. */
function merged(columns: readonly Column[]): Column[] {
  const sorted = [...columns].filter((column) => column.at >= 0 && column.at < 1).sort((a, b) => a.at - b.at);
  const result: Column[] = [];
  for (const column of sorted) {
    const last = result.at(-1);
    if (last && column.at - last.at < SAME_MOMENT) result[result.length - 1] = { at: last.at, before: Math.max(last.before, column.before), after: Math.max(last.after, column.after) };
    else result.push(column);
  }
  return result;
}

/** Where along a bar a moment of it stands (`at` from 0 to 1): between two of its marks, as far as its time is between theirs. */
export function placeIn({ marks }: BarSpacing, at: number): number {
  return along(marks, Math.min(1, Math.max(0, at)), 'at', 'x');
}

/** The moment of a bar (from 0 to 1) that stands at `x` along it: the inverse of placeIn. */
export function momentIn({ marks, width }: BarSpacing, x: number): number {
  return along(marks, Math.min(width, Math.max(0, x)), 'x', 'at');
}

function along(marks: BarSpacing['marks'], value: number, from: 'at' | 'x', to: 'at' | 'x'): number {
  for (let i = 1; i < marks.length; i++) {
    const before = marks[i - 1]!;
    const after = marks[i]!;
    if (value > after[from] && i < marks.length - 1) continue;
    const span = after[from] - before[from];
    return span <= 0 ? after[to] : before[to] + ((value - before[from]) / span) * (after[to] - before[to]);
  }
  return marks.at(-1)?.[to] ?? 0;
}
