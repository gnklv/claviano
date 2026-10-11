import type { Hand } from '../note';
import { isBlackKey } from '../pitch';
import { FINGERS, handwise, reachBetween, type Finger } from './hand';
import { alone, step, THUMB_ON_BLACK, turn } from './melody';
import { scaleFingers, type Key } from './scales';

/*
 * Fingers for a passage, one hand: single notes and chords in the order they are struck. The
 * fingering with the fewest points over the whole passage is found (every way of fingering each
 * moment against every way of fingering the one before it).
 *
 * Single notes in a row go by the rules of melody.ts. A chord adds its own:
 * - its fingers lie in the order of its keys, and no two of them further apart than a hand reaches;
 * - a stretch between neighbours beyond the comfortable costs 2 a semitone, a span off the relaxed
 *   1 a semitone with the thumb and 2 without (as between two notes in a row);
 * - the fourth finger costs 1, the fifth half of that: in a chord the little finger is where the
 *   hand ends, and the fourth is the clumsy one.
 * And going to or from a chord, where the hand is not led from key to key but set down anew:
 * - how far the hand has to move, a point a semitone (see `move`);
 * - a key held or struck again under another finger, 2;
 * - a finger that has a key more than a tone from the one it had two moments ago, 1 a semitone.
 *
 * Some fingers are not worked out but given: a run along a scale (scales.ts), a finger written in
 * the notes. And where the music stops (a rest, a new phrase) the hand is free: what comes after
 * costs nothing to reach.
 */

/** What is known of a passage besides its notes. */
export interface PassageHints {
  /** Fingers that are given, for each moment by the place of the key in it (lowest first): they stand, the rest is fitted to them. */
  readonly given?: readonly (readonly (Finger | null | undefined)[] | undefined)[];
  /** The moments the hand comes to freely (after a rest): nothing is counted for getting there. */
  readonly free?: readonly boolean[];
  /** The piece's key, to tell which scale a run is of. */
  readonly key?: Key;
}

/** What a step no rule allows costs between two fingers that are both given: it is played all the same. */
const GIVEN_ALL_THE_SAME = 50;
/** A step no hand can make without letting go: the hand jumps, and the passage goes on. */
const JUMP = 100;
/** A key struck again (or held on) under another finger. */
const CHANGE_ON_A_KEY = 2;

/** A way of fingering one moment: a finger for each of its keys, lowest key first. */
type Way = readonly Finger[];

/** Every way a hand can take these keys (lowest first) at once; none for more keys than fingers. */
function ways(keys: readonly number[], hand: Hand, given: readonly (Finger | null | undefined)[] | undefined): Way[] {
  const found: Way[] = [];
  // The right hand's fingers rise with its keys; the left's fall.
  const order = hand === 'right' ? FINGERS : [...FINGERS].reverse();
  const take = (from: number, way: Finger[]): void => {
    if (way.length === keys.length) {
      found.push([...way]);
      return;
    }
    for (let i = from; i < order.length; i++) {
      const finger = order[i]!;
      const wanted = given?.[way.length];
      if (wanted && wanted !== finger) continue;
      const within = way.every((other, at) => {
        const distance = handwise(keys[at]!, keys[way.length]!, hand);
        const reach = reachBetween(other, finger);
        return distance >= reach.minPractical && distance <= reach.maxPractical;
      });
      // (What is given is taken even where no hand reaches it: it is written so.)
      if (!within && !(wanted && way.every((_, at) => given?.[at]))) continue;
      take(i + 1, [...way, finger]);
    }
  };
  take(0, []);
  return found;
}

/** What a way of taking a chord costs by itself. */
function chord(keys: readonly number[], way: Way, hand: Hand): number {
  if (keys.length === 1) return alone(keys[0]!, way[0]!);
  let points = 0;
  way.forEach((finger, at) => {
    points += finger === 4 ? 1 : finger === 5 ? 0.5 : 0;
    if (finger === 1 && isBlackKey(keys[at]!)) points += THUMB_ON_BLACK;
    if (at === 0) return;
    const before = way[at - 1]!;
    const distance = handwise(keys[at - 1]!, keys[at]!, hand);
    const reach = reachBetween(before, finger);
    points += 2 * Math.max(0, distance - reach.maxComfortable, reach.minComfortable - distance);
    points += (before === 1 || finger === 1 ? 1 : 2) * Math.max(0, reach.minRelaxed - distance, distance - reach.maxRelaxed);
  });
  return points;
}

/**
 * What it costs to go from one moment to the next; Infinity when it cannot be played.
 *
 * Between two single notes the fingers lead: the rules of a line. To or from a chord the hand is
 * set down anew, and what counts is how far it has to move to do so: every key of the one moment
 * against every key of the next, as if all were held at once. Within what their two fingers reach
 * in comfort, the hand has not moved; beyond it, a point for each semitone (shared out among the
 * pairs, so that a big chord does not weigh more than a small one).
 */
function move(from: readonly number[], fromWay: Way, to: readonly number[], toWay: Way, hand: Hand): number {
  if (from.length === 1 && to.length === 1) return step(from[0]!, to[0]!, fromWay[0]!, toWay[0]!, hand) + (toWay[0] === 1 && isBlackKey(to[0]!) ? THUMB_ON_BLACK : 0);
  let moved = 0;
  let points = chord(to, toWay, hand);
  from.forEach((before, i) => {
    to.forEach((key, j) => {
      const [was, is] = [fromWay[i]!, toWay[j]!];
      if (key === before) {
        // A key held or struck again: best under the finger it has.
        if (was !== is) points += CHANGE_ON_A_KEY;
        return;
      }
      if (was === is) {
        // One finger, two keys: it has to let go and travel.
        moved += Math.abs(key - before);
        return;
      }
      const distance = handwise(before, key, hand);
      const reach = reachBetween(was, is);
      moved += Math.max(0, distance - reach.maxComfortable, reach.minComfortable - distance);
    });
  });
  return points + moved / (from.length * to.length);
}

/**
 * What the moment before last adds, where chords are about and the hand stays where it is: a finger
 * that had one key then and has a key well away from it now has leapt between them with one moment
 * to do it in. (So a figure that rocks between two bass notes a third apart under a held thumb
 * takes them with two fingers, not one.)
 */
function leap(before: readonly number[], beforeWay: Way, now: readonly number[], nowWay: Way): number {
  // Only where the hand has stayed: a key of then is a key of now. (A hand that has moved on, as
  // from one bass note of a waltz to the next, leaps with whatever finger it likes.)
  if (!before.some((key) => now.includes(key))) return 0;
  let points = 0;
  beforeWay.forEach((finger, i) => {
    const at = nowWay.indexOf(finger);
    // (A tone away is under the hand still; further is a leap, a point a semitone.)
    if (at >= 0) points += Math.max(0, Math.abs(now[at]! - before[i]!) - 2);
  });
  return points;
}

/**
 * The fingers for a passage: for each moment (its keys as MIDI pitches, lowest first), a finger
 * for each key. A moment with more keys than a hand has fingers, or keys no hand spans, gets none
 * (an empty list): it is not one hand's to play.
 */
export function fingerPassage(moments: readonly (readonly number[])[], hand: Hand, hints: PassageHints = {}): Finger[][] {
  if (moments.length === 0) return [];
  const given = moments.map((keys, i) => keys.map((_, at) => hints.given?.[i]?.[at] ?? null));
  // Runs along a scale, in the stretches of single notes: known, not worked out (see scales.ts).
  for (let from = 0; from < moments.length; ) {
    let to = from;
    while (to < moments.length && moments[to]!.length === 1 && (to === from || !hints.free?.[to])) to++;
    if (to > from) {
      scaleFingers(moments.slice(from, to).map((keys) => keys[0]!), hand, hints.key).forEach((finger, i) => (given[from + i]![0] ??= finger));
    }
    from = Math.max(to, from + 1);
  }

  const options = moments.map((keys, i) => ways(keys, hand, given[i]));
  const settled = (i: number) => given[i]!.length > 0 && given[i]!.every((finger) => finger);

  // The least points to arrive at each moment with each pair of ways (of the moment before, of
  // this one), and the way before that pair, to walk back by. (A moment that cannot be taken has
  // one "way" with no fingers, which costs nothing and breaks the passage.)
  type Cell = { points: number; before: number };
  type Row = Cell[][];
  const count = (i: number) => Math.max(1, options[i]!.length);
  const way = (i: number, at: number): Way => options[i]![at] ?? [];
  const blank = (i: number): Row => Array.from({ length: i === 0 ? 1 : count(i - 1) }, () => Array.from({ length: count(i) }, () => ({ points: Infinity, before: 0 })));
  const least = (row: Row) => {
    let best = { previous: 0, current: 0, points: Infinity };
    row.forEach((cells, previous) => cells.forEach((cell, current) => cell.points < best.points && (best = { previous, current, points: cell.points })));
    return best;
  };

  const rows: Row[] = [];
  const first = blank(0);
  first[0]!.forEach((cell, at) => (cell.points = way(0, at).length ? chord(moments[0]!, way(0, at), hand) : 0));
  rows.push(first);

  for (let i = 1; i < moments.length; i++) {
    const row = blank(i);
    const previous = rows[i - 1]!;
    // Nothing is counted for coming here after a rest, or from (or to) what no hand takes.
    const anew = hints.free?.[i] || options[i]!.length === 0 || options[i - 1]!.length === 0;
    for (let b = 0; b < count(i - 1); b++) {
      for (let c = 0; c < count(i); c++) {
        let pair = anew ? (way(i, c).length ? chord(moments[i]!, way(i, c), hand) : 0) : move(moments[i - 1]!, way(i - 1, b), moments[i]!, way(i, c), hand);
        if (pair === Infinity && settled(i - 1) && settled(i)) pair = GIVEN_ALL_THE_SAME;
        if (pair === Infinity) continue;
        previous.forEach((cells, a) => {
          const so = cells[b]!.points;
          if (so === Infinity) return;
          // Three single notes in a row, led from one to the next: what the three add (see melody.ts).
          const three = i >= 2 && !anew && !hints.free?.[i - 1] && moments[i - 2]!.length === 1 && moments[i - 1]!.length === 1 && moments[i]!.length === 1 && options[i - 2]!.length > 0;
          const led = i >= 2 && !anew && !hints.free?.[i - 1] && options[i - 2]!.length > 0;
          const over = three ? turn(moments[i - 2]![0]!, moments[i - 1]![0]!, moments[i]![0]!, way(i - 2, a)[0]!, way(i - 1, b)[0]!, way(i, c)[0]!, hand) : led ? leap(moments[i - 2]!, way(i - 2, a), moments[i]!, way(i, c)) : 0;
          const points = so + pair + over;
          const cell = row[b]![c]!;
          if (points < cell.points) {
            cell.points = points;
            cell.before = a;
          }
        });
      }
    }
    // Nothing can be played from here by the rules (a leap no hand makes): the hand jumps.
    if (row.every((cells) => cells.every((cell) => cell.points === Infinity))) {
      const best = least(previous);
      row[best.current]!.forEach((cell, c) => {
        cell.points = best.points + JUMP + (way(i, c).length ? chord(moments[i]!, way(i, c), hand) : 0);
        cell.before = best.previous;
      });
    }
    rows.push(row);
  }

  // Walk back from the best end.
  const fingers: Finger[][] = [];
  let { previous, current } = least(rows.at(-1)!);
  for (let i = moments.length - 1; i >= 0; i--) {
    fingers.unshift([...way(i, current)]);
    const before = rows[i]![previous]![current]!.before;
    current = previous;
    previous = before;
  }
  return fingers;
}

/** What is known of a line besides its notes. */
export interface LineHints {
  /** Fingers that are given (written in the notes), by the note's place in the line. */
  readonly given?: readonly (Finger | null | undefined)[];
  readonly key?: Key;
}

/** The fingers for a line of single notes (MIDI pitches, in the order they are played), one for each. */
export function fingerLine(pitches: readonly number[], hand: Hand, hints: LineHints = {}): Finger[] {
  const fingers = fingerPassage(
    pitches.map((pitch) => [pitch]),
    hand,
    { given: hints.given?.map((finger) => [finger]), key: hints.key },
  );
  return fingers.map((moment) => moment[0]!);
}
