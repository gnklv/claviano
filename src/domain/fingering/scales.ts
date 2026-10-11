import type { Hand } from '../note';
import type { Finger } from './hand';

/*
 * Scales are not worked out: they are known. A pianist who meets a run up or down a scale plays
 * it with the fingers every school teaches, the same in every octave: the thumb on a white key,
 * the fourth finger once to the octave. No rule of comfort gives exactly that (comfort does not
 * care whether the pattern repeats), so a run along a scale is fingered from the table.
 *
 * The table is the common one (as in Hanon's exercises): for each key, the finger on each degree
 * of the scale. At the two ends of a run the pattern gives way: on the little finger's side the
 * hand runs out to its last fingers (the right hand's Do major ends 4, 5, not 4, 1), and on the
 * thumb's side it starts from the second finger rather than the fourth (Si♭ major: 2, 1, 2, 3…).
 */

export interface Key {
  /** The tonic's pitch class: 0 is Do, 1 Do♯, up to 11, Si. */
  readonly tonic: number;
  readonly minor: boolean;
}

type Degrees = readonly [Finger, Finger, Finger, Finger, Finger, Finger, Finger];

/** The fingers on the seven degrees, for the white-key way of playing a scale: three, then four. */
const THREE_FOUR: Degrees = [1, 2, 3, 1, 2, 3, 4];
/** The left hand's mirror of it: the thumb on the fifth degree and (in the middle of a run) the first. */
const LEFT_COMMON: Degrees = [1, 4, 3, 2, 1, 3, 2];
const LEFT_FLATS: Degrees = [3, 2, 1, 4, 3, 2, 1];

/** By tonic (0 = Do): the fingers on the degrees of the major scale, each hand. */
const MAJOR: Record<Hand, Record<number, Degrees>> = {
  right: {
    0: THREE_FOUR,
    7: THREE_FOUR,
    2: THREE_FOUR,
    9: THREE_FOUR,
    4: THREE_FOUR,
    11: THREE_FOUR,
    5: [1, 2, 3, 4, 1, 2, 3],
    10: [4, 1, 2, 3, 1, 2, 3],
    3: [3, 1, 2, 3, 4, 1, 2],
    8: [3, 4, 1, 2, 3, 1, 2],
    1: [2, 3, 1, 2, 3, 4, 1],
    6: [2, 3, 4, 1, 2, 3, 1],
  },
  left: {
    0: LEFT_COMMON,
    7: LEFT_COMMON,
    2: LEFT_COMMON,
    9: LEFT_COMMON,
    4: LEFT_COMMON,
    5: LEFT_COMMON,
    11: [1, 3, 2, 1, 4, 3, 2],
    10: LEFT_FLATS,
    3: LEFT_FLATS,
    8: LEFT_FLATS,
    1: LEFT_FLATS,
    6: [4, 3, 2, 1, 3, 2, 1],
  },
};

/** The same for the minor scales (the harmonic and the melodic are fingered as the natural). */
const MINOR: Record<Hand, Record<number, Degrees>> = {
  right: {
    9: THREE_FOUR,
    4: THREE_FOUR,
    2: THREE_FOUR,
    7: THREE_FOUR,
    0: THREE_FOUR,
    11: THREE_FOUR,
    5: [1, 2, 3, 4, 1, 2, 3],
    6: [3, 4, 1, 2, 3, 1, 2],
    1: [3, 4, 1, 2, 3, 1, 2],
    8: [3, 4, 1, 2, 3, 1, 2],
    3: [3, 1, 2, 3, 4, 1, 2],
    10: [4, 1, 2, 3, 1, 2, 3],
  },
  left: {
    9: LEFT_COMMON,
    4: LEFT_COMMON,
    2: LEFT_COMMON,
    7: LEFT_COMMON,
    0: LEFT_COMMON,
    5: LEFT_COMMON,
    11: [1, 3, 2, 1, 4, 3, 2],
    6: [4, 3, 2, 1, 3, 2, 1],
    1: LEFT_FLATS,
    8: LEFT_FLATS,
    3: [2, 1, 4, 3, 2, 1, 3],
    10: [2, 1, 3, 2, 1, 4, 3],
  },
};

/** The degree (0 to 6) a pitch class stands on in a key; undefined when it is not of the scale. */
const MAJOR_DEGREES: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
/** (The sixth and the seventh of a minor scale each have two forms.) */
const MINOR_DEGREES: Record<number, number> = { 0: 0, 2: 1, 3: 2, 5: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };

const degreeIn = (pitch: number, key: Key): number | undefined => (key.minor ? MINOR_DEGREES : MAJOR_DEGREES)[(((pitch - key.tonic) % 12) + 12) % 12];

const KEYS: readonly Key[] = [false, true].flatMap((minor) => Array.from({ length: 12 }, (_, tonic) => ({ tonic, minor })));

/** A run along a scale needs the thumb passed at least once to be worth the table: shorter ones lie under the hand. */
const SHORTEST_RUN = 6;

/** Whether `pitches[from..to]` walks one way along `key`, a degree at a time. */
function walks(pitches: readonly number[], from: number, to: number, key: Key): boolean {
  const up = pitches[from + 1]! > pitches[from]!;
  for (let i = from; i <= to; i++) {
    const degree = degreeIn(pitches[i]!, key);
    if (degree === undefined) return false;
    if (i === from) continue;
    const before = degreeIn(pitches[i - 1]!, key)!;
    if (degree !== (before + (up ? 1 : 6)) % 7) return false;
  }
  return true;
}

/** The key a run is taken to be in: the one said, if the run is of it; else one it begins or ends on the tonic of; else any it fits. */
function keyOf(pitches: readonly number[], from: number, to: number, said: Key | undefined): Key | undefined {
  const fitting = KEYS.filter((key) => walks(pitches, from, to, key));
  const onTonic = (key: Key) => [pitches[from]!, pitches[to]!].some((pitch) => (((pitch - key.tonic) % 12) + 12) % 12 === 0);
  return fitting.find((key) => said && key.tonic === said.tonic && key.minor === said.minor) ?? fitting.find(onTonic) ?? fitting[0];
}

/**
 * The fingers for the runs along a scale in a line of single notes: one for each note of such a
 * run, null for the notes that are in none. `key`: the piece's key, if known, to tell a run in
 * Do major from the same notes in La minor.
 */
export function scaleFingers(pitches: readonly number[], hand: Hand, key?: Key): (Finger | null)[] {
  const fingers: (Finger | null)[] = pitches.map(() => null);
  const step = (i: number) => pitches[i + 1]! - pitches[i]!;
  let from = 0;
  while (from < pitches.length - 1) {
    // As far as the line goes on one way, by steps no wider than a scale has.
    let to = from;
    const up = step(from) > 0;
    while (to < pitches.length - 1 && step(to) !== 0 && step(to) > 0 === up && Math.abs(step(to)) <= 3) to++;
    // …and no further than it stays in one key.
    let runKey = to - from + 1 >= SHORTEST_RUN ? keyOf(pitches, from, to, key) : undefined;
    while (!runKey && to - from + 1 > SHORTEST_RUN) runKey = keyOf(pitches, from, --to, key);
    if (runKey) {
      const run = fingerRun(pitches.slice(from, to + 1), hand, runKey);
      run.forEach((finger, i) => (fingers[from + i] = finger));
    }
    // (The note a run ends on may begin the next one, the other way.)
    from = Math.max(to, from + 1);
  }
  return fingers;
}

/** One run, fingered from the table, its two ends as a hand would play them. */
function fingerRun(run: readonly number[], hand: Hand, key: Key): Finger[] {
  const table = (key.minor ? MINOR : MAJOR)[hand][key.tonic]!;
  const fingers = run.map((pitch) => table[degreeIn(pitch, key)!]!);

  // The run as the hand lies: from the thumb's side to the little finger's.
  const ascending = run[1]! > run[0]!;
  const reversed = (hand === 'right') !== ascending;
  if (reversed) fingers.reverse();

  // The thumb's side: before the first thumb, the fingers count up from the second.
  const firstThumb = fingers.indexOf(1);
  for (let i = 0; i < firstThumb; i++) fingers[i] = (2 + i) as Finger;
  // The little finger's side: after the last thumb the fingers run on, to the fifth if need be.
  const lastThumb = fingers.lastIndexOf(1);
  if (lastThumb === fingers.length - 1 && fingers.length > 1 && fingers[lastThumb - 1]! > 1) fingers[lastThumb] = Math.min(5, fingers[lastThumb - 1]! + 1) as Finger;

  if (reversed) fingers.reverse();
  return fingers;
}
