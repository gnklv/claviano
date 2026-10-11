import type { Hand } from '../note';

/*
 * What a hand can reach: for each pair of fingers, how far apart their keys may be, in semitones.
 * From Parncutt, Sloboda, Clarke, Raekallio and Desain, "An ergonomic model of keyboard fingering
 * for melodic fragments" (Music Perception, 1997), measured on pianists' hands: an average adult's.
 *
 * Three ranges, each inside the next:
 * - relaxed: the hand lies loose, nothing stretches;
 * - comfortable: it can be played without strain;
 * - practical: it can be played at all.
 *
 * The numbers are for the right hand going from the first finger of the pair to the second: for
 * the thumb and the index, from 5 semitones the "wrong" way (the index under the thumb) to 10 the
 * right way. The left hand is the mirror of it.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;
export const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/** How far from one finger to another a key may be: the limits of the three ranges, in semitones. */
export interface Reach {
  readonly minPractical: number;
  readonly minComfortable: number;
  readonly minRelaxed: number;
  readonly maxRelaxed: number;
  readonly maxComfortable: number;
  readonly maxPractical: number;
}

const reach = (minPractical: number, minComfortable: number, minRelaxed: number, maxRelaxed: number, maxComfortable: number, maxPractical: number): Reach => ({
  minPractical,
  minComfortable,
  minRelaxed,
  maxRelaxed,
  maxComfortable,
  maxPractical,
});

/** From the lower-numbered finger to the higher, right hand. */
const PAIRS: Record<string, Reach> = {
  '1-2': reach(-5, -3, 1, 5, 8, 10),
  '1-3': reach(-4, -2, 3, 7, 10, 12),
  '1-4': reach(-3, -1, 5, 9, 12, 14),
  '1-5': reach(-1, 1, 7, 10, 13, 15),
  '2-3': reach(1, 1, 1, 2, 3, 5),
  '2-4': reach(1, 1, 3, 4, 5, 7),
  '2-5': reach(2, 2, 5, 6, 8, 10),
  '3-4': reach(1, 1, 1, 2, 2, 4),
  '3-5': reach(1, 1, 3, 4, 5, 7),
  '4-5': reach(1, 1, 1, 2, 3, 5),
};

const SAME_KEY = reach(0, 0, 0, 0, 0, 0);

/**
 * How far the key under finger `to` may be from the key under finger `from`, counted towards the
 * little finger's side of the hand (up the keyboard for the right hand, down it for the left).
 */
export function reachBetween(from: Finger, to: Finger): Reach {
  if (from === to) return SAME_KEY;
  if (from < to) return PAIRS[`${from}-${to}`]!;
  // The other way round: the same distances, counted backwards.
  const there = PAIRS[`${to}-${from}`]!;
  return reach(-there.maxPractical, -there.maxComfortable, -there.maxRelaxed, -there.minRelaxed, -there.minComfortable, -there.minPractical);
}

/** The distance from one key to another as the hand feels it: towards its little finger is forward. */
export const handwise = (from: number, to: number, hand: Hand): number => (hand === 'right' ? to - from : from - to);
