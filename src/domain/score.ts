import { noteEnd, type Note } from './note';
import type { Clef, ClefChange, WrittenNote, WrittenRest } from './notation/written';

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

/** Metre from `beat` on, e.g. 3/4 or 6/8. */
export interface TimeSignature {
  /** Where it starts, in quarter notes. */
  readonly beat: number;
  readonly numerator: number;
  /** A power of two: 4 = quarter notes, 8 = eighths. */
  readonly denominator: number;
}

/** Key from `beat` on, written as the number of sharps or flats at the clef. */
export interface KeySignature {
  /** Where it starts, in quarter notes. */
  readonly beat: number;
  /** Positive: that many sharps; negative: flats; 0: none (Do major / La minor). */
  readonly fifths: number;
  readonly minor: boolean;
}

export interface Score {
  readonly title: string;
  /** Sorted by start time. */
  readonly notes: readonly Note[];
  /** Start time of every bar in seconds, sorted, first one is 0. */
  readonly bars: readonly number[];
  /** Start of every bar in quarter notes; same indices as `bars`. */
  readonly barBeats: readonly number[];
  /** Sorted by beat, the first one at beat 0. */
  readonly timeSignatures: readonly TimeSignature[];
  /** Sorted by beat, the first one at beat 0. */
  readonly keySignatures: readonly KeySignature[];
  readonly duration: number;
  /** Where the last note ends, in quarter notes. */
  readonly endBeat: number;
  /** The notes as printed, when the source has notation (MusicXML); the staff then uses them. */
  readonly written: readonly WrittenNote[] | null;
  /** Clefs per staff, sorted by beat; empty means treble on the upper staff and bass on the lower. */
  readonly clefs: readonly ClefChange[];
  /** Printed rests, when the source has notation (MusicXML). */
  readonly rests: readonly WrittenRest[];
}

/** Musical details a source may or may not provide; sensible defaults fill the gaps. */
export interface ScoreMusic {
  /** Same length and order as the bars passed to createScore. Default: every bar is 4 quarters. */
  readonly barBeats?: readonly number[];
  readonly timeSignatures?: readonly TimeSignature[];
  readonly keySignatures?: readonly KeySignature[];
  readonly written?: readonly WrittenNote[];
  readonly clefs?: readonly ClefChange[];
  readonly rests?: readonly WrittenRest[];
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
export const DEFAULT_KEY_SIGNATURE: KeySignature = { beat: 0, fifths: 0, minor: false };

/**
 * Sorts events by beat and makes sure one starts at beat 0. Files often repeat the same event
 * (e.g. the key once per track): at one beat the last event wins, and a repeat of the previous
 * value is dropped.
 */
function fromBeatZero<T extends { readonly beat: number }>(
  events: readonly T[] | undefined,
  fallback: T,
  sameValue: (a: T, b: T) => boolean,
): T[] {
  const sorted = [...(events ?? [])].sort((a, b) => a.beat - b.beat);
  if (sorted.length === 0 || sorted[0].beat > 0) sorted.unshift(fallback);
  const result: T[] = [];
  for (const event of sorted) {
    if (result.length > 0 && result[result.length - 1].beat === event.beat) result.pop();
    if (result.length > 0 && sameValue(result[result.length - 1], event)) continue;
    result.push(event);
  }
  return result;
}

export function createScore(
  title: string,
  notes: readonly Note[],
  bars: readonly number[],
  music: ScoreMusic = {},
): Score {
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const duration = sortedNotes.reduce((max, note) => Math.max(max, noteEnd(note)), 0);
  const endBeat = sortedNotes.reduce((max, note) => Math.max(max, note.beat + note.beats), 0);

  // Bars and their beats travel together, so they stay aligned after filtering and sorting.
  const barPairs = bars
    .map((time, index) => ({ time, beat: music.barBeats?.[index] ?? index * 4 }))
    .filter((bar) => bar.time < duration)
    .sort((a, b) => a.time - b.time);
  if (barPairs[0]?.time !== 0) barPairs.unshift({ time: 0, beat: 0 });

  return {
    title,
    notes: sortedNotes,
    bars: barPairs.map((bar) => bar.time),
    barBeats: barPairs.map((bar) => bar.beat),
    timeSignatures: fromBeatZero(
      music.timeSignatures,
      DEFAULT_TIME_SIGNATURE,
      (a, b) => a.numerator === b.numerator && a.denominator === b.denominator,
    ),
    keySignatures: fromBeatZero(
      music.keySignatures,
      DEFAULT_KEY_SIGNATURE,
      (a, b) => a.fifths === b.fifths && a.minor === b.minor,
    ),
    duration,
    endBeat,
    written: music.written ?? null,
    clefs: [...(music.clefs ?? [])].sort((a, b) => a.beat - b.beat),
    rests: music.rests ?? [],
  };
}

export const EMPTY_SCORE: Score = createScore('', [], []);

/** Index of the last element in a sorted array that is <= value, or -1. */
function lastIndexAtOrBefore(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Zero-based index of the bar that contains `time`. */
export const barAt = (score: Score, time: number): number =>
  Math.max(0, lastIndexAtOrBefore(score.bars, time));

/** Zero-based index of the bar that contains `beat` (quarter notes). */
export const barAtBeat = (score: Score, beat: number): number =>
  Math.max(0, lastIndexAtOrBefore(score.barBeats, beat + 1e-9));

/**
 * How many quarter notes bar `index` lasts. The last bar has no next bar to measure against:
 * it lasts until the music ends, but no longer than its time signature allows.
 */
export function barLength(score: Score, index: number): number {
  const start = score.barBeats[index];
  const next = score.barBeats[index + 1];
  if (next !== undefined) return next - start;
  const nominal = barLengthInBeats(timeSignatureAt(score, start));
  const untilEnd = score.endBeat - start;
  return untilEnd > 0 ? Math.min(nominal, untilEnd) : nominal;
}

/**
 * Whether the piece opens with a pickup (anacrusis): a first bar shorter than its time signature,
 * like the two sixteenths before the first full bar of Für Elise.
 */
export const hasPickup = (score: Score): boolean =>
  score.bars.length > 1 && barLength(score, 0) < barLengthInBeats(timeSignatureAt(score, 0)) - 1e-6;

/** The number printed for bar `index` (zero-based): a pickup is bar 0, the first full bar is 1. */
export const barNumber = (score: Score, index: number): number => index + (hasPickup(score) ? 0 : 1);

/** The index of the bar printed as `number`, the inverse of barNumber. */
export const barIndexOf = (score: Score, number: number): number => number - (hasPickup(score) ? 0 : 1);

/** Time range covering bars `from..to` inclusive (zero-based). */
export function barRange(score: Score, from: number, to: number): TimeRange {
  const last = score.bars.length - 1;
  const first = Math.min(Math.max(0, Math.min(from, to)), last);
  const final = Math.min(Math.max(0, Math.max(from, to)), last);
  return { start: score.bars[first], end: score.bars[final + 1] ?? score.duration };
}

/** Index of the first note that starts at or after `time`. */
export function firstNoteAtOrAfter(score: Score, time: number): number {
  const { notes } = score;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].start < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The time signature in force at `beat`. */
export const timeSignatureAt = (score: Score, beat: number): TimeSignature =>
  score.timeSignatures[Math.max(0, lastIndexAtOrBefore(score.timeSignatures.map((s) => s.beat), beat))];

/** The key signature in force at `beat`. */
export const keySignatureAt = (score: Score, beat: number): KeySignature =>
  score.keySignatures[Math.max(0, lastIndexAtOrBefore(score.keySignatures.map((s) => s.beat), beat))];

/** Beat position (quarter notes) of `time` in seconds, by interpolating inside its bar. */
export function beatAt(score: Score, time: number): number {
  const index = barAt(score, time);
  const start = score.bars[index];
  const end = score.bars[index + 1] ?? score.duration;
  const startBeat = score.barBeats[index];
  const endBeat = score.barBeats[index + 1] ?? startBeat + barLengthInBeats(timeSignatureAt(score, startBeat));
  const fraction = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
  return startBeat + fraction * (endBeat - startBeat);
}

/** How many quarter notes a bar of this metre lasts: 3/4 → 3, 6/8 → 3, 2/2 → 4. */
export const barLengthInBeats = ({ numerator, denominator }: TimeSignature): number =>
  (numerator * 4) / denominator;

/** The clef in force on a staff (1 upper, 2 lower) at `beat`. */
export function clefAt(score: Score, staff: number, beat: number): Clef {
  let clef: Clef = staff === 1 ? 'treble' : 'bass';
  for (const change of score.clefs) {
    if (change.beat > beat + 1e-9) break;
    if (change.staff === staff) clef = change.clef;
  }
  return clef;
}
