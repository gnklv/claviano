import type { Hand } from '../note';
import { isBlackKey } from '../pitch';
import { handwise, reachBetween, type Finger } from './hand';

/*
 * The rules for single notes in a row, one hand (the working out is in passage.ts): the fingering
 * that is least awkward over the whole line, by the rules of Parncutt and others (1997; see hand.ts). Each rule gives points for
 * something a hand does not like; the fingering with the fewest points is the one a pianist would
 * most likely choose.
 *
 * The rules, between two notes in a row:
 * - stretch: beyond what is comfortable for the two fingers, 2 a semitone;
 * - small span, large span: off the relaxed range, 1 a semitone with the thumb, 2 without;
 * - weak finger: 1 for each use of the fourth or the fifth;
 * - three to four: 1 when the third is followed by the fourth;
 * - four on black: 1 for the third on a white key next to the fourth on a black one;
 * - thumb on black: 1, and 2 more for each white key next to it; five on black: 2 for each;
 * - thumb passing: 1 on one level (white to white, black to black), 3 from a finger on a white key
 *   to the thumb on a black one above it.
 * And over three notes in a row:
 * - change of position: 1 when the first and the third lie outside what their fingers reach in
 *   comfort (2 when the thumb in the middle carries the hand over), and 1 a semitone of it;
 * - three, four, five: 1 when the three weak-side fingers come one after another.
 *
 * What cannot be played is not offered: a reach outside the practical, or one finger on two
 * different keys in a row.
 *
 * Some fingers are not worked out but given: a run along a scale is played with the fingers every
 * school teaches (see scales.ts), and a finger written in the notes stands as it is written. The
 * rules then find the best fingers for the rest, around them.
 *
 * The line is taken whole: it is for the caller to cut the music where the hand is free to move (a
 * rest, the end of a phrase).
 */

/** A thumb passed under (or a finger over it), on one level. */
const PASS = 3;
/** Each semitone a pass goes beyond a whole tone. */
const PASS_LEAP = 2;
/** The thumb on a black key, whatever is beside it. */
export const THUMB_ON_BLACK = 2;

/** The points for going from one note to the next with these fingers; Infinity when it cannot be played. */
export function step(from: number, to: number, fromFinger: Finger, toFinger: Finger, hand: Hand): number {
  const distance = handwise(from, to, hand);
  if (fromFinger === toFinger) return distance === 0 ? weakness(toFinger) : Infinity;
  const reach = reachBetween(fromFinger, toFinger);
  if (distance < reach.minPractical || distance > reach.maxPractical) return Infinity;

  const black = { from: isBlackKey(from), to: isBlackKey(to) };
  let points = weakness(toFinger);
  // Thumb passing: the thumb under a finger, or a finger over the thumb. The hand turns, and the
  // table of reaches (which is of fingers side by side) has nothing to say of how far.
  const passing = (toFinger === 1 && distance > 0) || (fromFinger === 1 && distance < 0);
  if (passing) {
    // Of the two keys, the one nearer the little finger is the thumb's.
    const thumbOnBlack = toFinger === 1 ? black.to : black.from;
    const fingerOnBlack = toFinger === 1 ? black.from : black.to;
    points += thumbOnBlack === fingerOnBlack ? PASS : thumbOnBlack ? PASS + 2 : PASS - 1;
    // Past a whole tone the pass is a leap.
    points += PASS_LEAP * Math.max(0, Math.abs(distance) - 2);
  } else {
    const thumb = fromFinger === 1 || toFinger === 1;
    // Stretch.
    points += 2 * Math.max(0, distance - reach.maxComfortable, reach.minComfortable - distance);
    // Small span, large span.
    points += (thumb ? 1 : 2) * Math.max(0, reach.minRelaxed - distance, distance - reach.maxRelaxed);
  }
  // Three to four.
  if (fromFinger === 3 && toFinger === 4) points += 1;
  // Four on black.
  if ((fromFinger === 3 && toFinger === 4 && !black.from && black.to) || (fromFinger === 4 && toFinger === 3 && black.from && !black.to)) points += 1;
  // Thumb on black, five on black: what a white key beside it adds.
  if (toFinger === 1 && black.to && !black.from) points += 2;
  if (fromFinger === 1 && black.from && !black.to) points += 2;
  if (toFinger === 5 && black.to && !black.from) points += 2;
  if (fromFinger === 5 && black.from && !black.to) points += 2;
  return points;
}

/** What a finger costs on a key by itself: the weak fingers, and the thumb on a black key. */
const weakness = (finger: Finger): number => (finger >= 4 ? 1 : 0);
export const alone = (pitch: number, finger: Finger): number => weakness(finger) + (finger === 1 && isBlackKey(pitch) ? THUMB_ON_BLACK : 0);

/** The points three notes in a row add to what each pair of them costs. */
export function turn(first: number, middle: number, third: number, a: Finger, b: Finger, c: Finger, hand: Hand): number {
  let points = 0;
  const distance = handwise(first, third, hand);
  const reach = reachBetween(a, c);
  const outside = Math.max(0, distance - reach.maxComfortable, reach.minComfortable - distance);
  if (outside > 0) {
    // A change of position: a whole one when the thumb in the middle carries the hand across.
    const between = (first < middle && middle < third) || (first > middle && middle > third);
    const whole = b === 1 && between && (distance < reach.minPractical || distance > reach.maxPractical);
    points += (whole ? 2 : 1) + outside;
  }
  // Three, four, five.
  if (a !== b && b !== c && a !== c && a >= 3 && b >= 3 && c >= 3) points += 1;
  return points;
}
