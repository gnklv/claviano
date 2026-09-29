import {
  barAtBeat,
  barLength,
  barLengthInBeats,
  timeSignatureAt,
  writtenPositionAt,
  type Score,
  type TimeSignature,
} from '../../domain/score';

/** Where each bar starts on the tape and how wide it is, in "bar units" (a full bar is 1 wide). */
export interface TapeBars {
  readonly starts: readonly number[];
  readonly widths: readonly number[];
  /** Where the last bar ends. */
  readonly end: number;
}

const tapeBarsCache = new WeakMap<Score, TapeBars>();

/**
 * Full bars are equally wide, as in printed music, whatever their duration in seconds.
 * An incomplete bar (a pickup, or the shortened last bar that often goes with it) is as wide
 * as the share of the time signature it fills, so its notes are not stretched apart.
 */
export function tapeBars(score: Score): TapeBars {
  const cached = tapeBarsCache.get(score);
  if (cached) return cached;
  const starts: number[] = [];
  const widths: number[] = [];
  let position = 0;
  score.writtenBarBeats.forEach((start, index) => {
    const nominal = barLengthInBeats(timeSignatureAt(score, start));
    const width = Math.min(1, Math.max(MIN_BAR_SHARE, barLength(score, index) / nominal));
    starts.push(position);
    widths.push(width);
    position += width;
  });
  const result = { starts, widths, end: position };
  tapeBarsCache.set(score, result);
  return result;
}

/** A bar never gets narrower than this share, so a very short bar stays readable. */
const MIN_BAR_SHARE = 0.25;

/**
 * Where `time` falls on the tape, in bar units: 0 is the start of the first bar, 2.5 the middle
 * of the third one (when all bars are full). Bars can last different times (tempo or metre
 * changes), so the tape's speed varies per bar, but bar lines stay evenly spaced.
 * The tape shows printed bars, so with repeats the position goes back.
 */
export function barPosition(score: Score, time: number): number {
  // Played bars map to printed ones: on a repeat the position jumps back along the tape.
  const { bar, fraction } = writtenPositionAt(score, time);
  const bars = tapeBars(score);
  return bars.starts[bar] + fraction * bars.widths[bar];
}

/** Where a musical position (bar index and beat) falls on the tape, in bar units. */
export function beatPosition(score: Score, bar: number, beat: number): number {
  const bars = tapeBars(score);
  return bars.starts[bar] + ((beat - score.writtenBarBeats[bar]) / barLength(score, bar)) * bars.widths[bar];
}

/** The beat at `x` on the tape (bar units) within printed bar `bar`, the inverse of beatPosition. */
export function beatAtPosition(score: Score, bar: number, x: number): number {
  const bars = tapeBars(score);
  const fraction = Math.min(1, Math.max(0, (x - bars.starts[bar]) / bars.widths[bar]));
  return score.writtenBarBeats[bar] + fraction * barLength(score, bar);
}

export type { Clef } from '../../domain/notation/written';
import type { Clef } from '../../domain/notation/written';

/*
 * Vertical positions on a staff are counted in "steps": half a staff space, from the top line
 * downwards. 0 is the top line, 1 the space below it, 2 the second line … 8 the bottom line;
 * negative steps are above the staff.
 *
 * Key signature accidentals always go in the same order and at the same places:
 * sharps Fa Do Sol Re La Mi Si, flats Si Mi La Re Sol Do Fa. On the treble staff the first sharp
 * (Fa) sits on the top line; on the bass staff everything is two steps lower (a third down).
 */
const SHARP_STEPS_TREBLE = [0, 3, -1, 2, 5, 1, 4];
const FLAT_STEPS_TREBLE = [4, 1, 5, 2, 6, 3, 7];
const BASS_OFFSET = 2;

/** Staff steps of the key signature's accidentals, in the order they are written. */
export function keySignatureSteps(fifths: number, clef: Clef): number[] {
  const steps = fifths >= 0 ? SHARP_STEPS_TREBLE : FLAT_STEPS_TREBLE;
  const offset = clef === 'bass' ? BASS_OFFSET : 0;
  return steps.slice(0, Math.min(7, Math.abs(fifths))).map((step) => step + offset);
}

/**
 * Staff steps of the naturals printed at a key change: they cancel the old key's accidentals that
 * the new key no longer has. From three flats to two sharps all three flats are cancelled; from
 * three flats to one only the last two; from one flat to two, none.
 */
export function cancelledSteps(from: number, to: number, clef: Clef): number[] {
  const kept = Math.sign(from) === Math.sign(to) ? Math.min(Math.abs(from), Math.abs(to)) : 0;
  return keySignatureSteps(from, clef).slice(kept);
}

/** What changes at the start of a printed bar: the key (from, to) and/or the time signature. */
export interface SignatureChange {
  readonly bar: number;
  readonly key: { readonly from: number; readonly to: number } | null;
  readonly time: TimeSignature | null;
}

/**
 * The key and time changes along the page, by printed bar. The opening signatures are not
 * changes; a change inside a bar (rare) is shown at the start of that bar.
 */
export function signatureChanges(score: Score): SignatureChange[] {
  const byBar = new Map<number, { key: SignatureChange['key']; time: TimeSignature | null }>();
  const at = (beat: number) => {
    const bar = barAtBeat(score, beat);
    const entry = byBar.get(bar) ?? { key: null, time: null };
    byBar.set(bar, entry);
    return entry;
  };
  score.keySignatures.forEach((key, i) => {
    if (i > 0 && key.beat > 1e-9) at(key.beat).key = { from: score.keySignatures[i - 1].fifths, to: key.fifths };
  });
  score.timeSignatures.forEach((time, i) => {
    if (i > 0 && time.beat > 1e-9) at(time.beat).time = time;
  });
  return [...byBar].sort((a, b) => a[0] - b[0]).map(([bar, change]) => ({ bar, ...change }));
}
