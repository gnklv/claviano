import { noteEnd, type Note } from './note';
import type { BarNavigation } from './notation/navigation';
import type { PedalMark, PedalSpan } from './pedal';
import type { Clef, ClefChange, WrittenGraces, WrittenNote, WrittenRest } from './notation/written';
import type { WrittenDuration } from './notation/noteValue';
import type { DynamicLevel, DynamicMark, Hairpin } from './notation/dynamics';
import type { Notation } from './notation/notation';
import { firstAtOrAfter, lastAtOrBefore } from './search';

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

/**
 * A point of the time map: quarter note `beat` (as played) sounds at `time` seconds. Between two
 * points time runs evenly. `hold`: the stretch up to the next point is held (a fermata), so no
 * beat is counted inside it.
 */
export interface TimePoint {
  readonly beat: number;
  readonly time: number;
  readonly hold?: boolean;
}

/** A metronome mark from `beat` (along the page) on, as printed: "♩ = 90", "♩. = 60". */
export interface TempoMark {
  readonly beat: number;
  /** The note that is counted: a quarter, a dotted quarter… */
  readonly unit: WrittenDuration;
  readonly perMinute: number;
  /** As a reader gives it: printed as a metronome mark, or only meant (a tempo with no mark on the page). */
  readonly printed?: boolean;
}

/**
 * An octave shift as printed (8va, 8vb, 15ma…): notes on `staff` from `start` to `end` (beats along
 * the page) are written `octaves` lower than they sound (negative: higher, as under 8vb).
 */
export interface OctaveShift {
  /** 1 upper, 2 lower. */
  readonly staff: number;
  readonly start: number;
  readonly end: number;
  readonly octaves: number;
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

/** When a group of grace notes sounds along the page: the first from `beat`, each lasting `each` quarter notes. */
export interface GraceSound {
  readonly beat: number;
  readonly each: number;
}

/*
 * A score is a piece twice over. As played: its notes in time, bars in the order they are played
 * (repeats unrolled), the pedals, the time map — playback, falling notes, loops and seeking use
 * these. And as printed: its `notation`, each bar once — the staff uses that. `barWritten` links
 * the two. A notation file is played by the domain (performNotation), a performance is written
 * down by it (transcribed): either way a score has both.
 */
export interface Score {
  readonly title: string;
  /** Sorted by start time; in performance order. */
  readonly notes: readonly Note[];
  /** Start time of every bar as played, in seconds, sorted, first one is 0. */
  readonly bars: readonly number[];
  /** Start of every bar as played, in quarter notes; same indices as `bars`. */
  readonly barBeats: readonly number[];
  /** For every bar as played, the printed bar it is (index into `notation.bars`). */
  readonly barWritten: readonly number[];
  readonly duration: number;
  /** Where the last note ends, in quarter notes. */
  readonly endBeat: number;
  /** When the sustain pedal is down, as played; sorted. */
  readonly pedal: readonly PedalSpan[];
  /** When the middle (sostenuto) and left (soft) pedals are down, as played; sorted. */
  readonly sostenutoPedal: readonly PedalSpan[];
  readonly softPedal: readonly PedalSpan[];
  /**
   * Beats to seconds, as played: sorted, the first point at beat 0. Tempo can change inside a bar
   * and fermatas stretch it, so bar starts alone are not enough to place a beat in time.
   */
  readonly timeMap: readonly TimePoint[];
  /**
   * When each group of grace notes sounds along the page (same indices as `notation.graces`): the
   * first one from `beat`, each for `each` quarter notes. For lighting them up as they sound.
   */
  readonly graceSounds: readonly GraceSound[];
  /**
   * The piece as printed. Its key and time signatures are sorted with the first at beat 0; its
   * other lists are sorted along the page.
   */
  readonly notation: Notation;
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
  readonly graces?: readonly WrittenGraces[];
  readonly graceSounds?: readonly GraceSound[];
  /** When bars are played in another order than printed (repeats): see Score. */
  readonly barWritten?: readonly number[];
  readonly writtenBarBeats?: readonly number[];
  readonly writtenEndBeat?: number;
  readonly navigation?: readonly BarNavigation[];
  readonly pedal?: readonly PedalSpan[];
  readonly sostenutoPedal?: readonly PedalSpan[];
  readonly softPedal?: readonly PedalSpan[];
  readonly pedalMarks?: readonly PedalMark[];
  /** Default: time runs evenly within each bar. */
  readonly timeMap?: readonly TimePoint[];
  readonly tempoMarks?: readonly TempoMark[];
  readonly octaveShifts?: readonly OctaveShift[];
  readonly dynamics?: readonly DynamicMark[];
  readonly hairpins?: readonly Hairpin[];
  /** What only playing the notation needs (see Notation): kept with it. */
  readonly tempos?: Notation['tempos'];
  readonly pedalMoves?: Notation['pedalMoves'];
  readonly dynamicLevels?: readonly DynamicLevel[];
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

  // Bars travel with their beats and printed bar, so they stay aligned after filtering and sorting.
  const barPairs = bars
    .map((time, index) => ({ time, beat: music.barBeats?.[index] ?? index * 4, written: music.barWritten?.[index] ?? index }))
    .filter((bar) => bar.time < duration)
    .sort((a, b) => a.time - b.time);
  if (barPairs[0]?.time !== 0) barPairs.unshift({ time: 0, beat: 0, written: 0 });
  const barBeats = barPairs.map((bar) => bar.beat);

  const timeSignatures = fromBeatZero(
    music.timeSignatures,
    DEFAULT_TIME_SIGNATURE,
    (a, b) => a.numerator === b.numerator && a.denominator === b.denominator,
  );
  // The printed bars: where each starts along the page, and how long it is. The last one has no
  // next bar to measure against: it lasts until the music ends, but no longer than its metre allows.
  const starts = music.writtenBarBeats ?? barBeats;
  const end = music.writtenEndBeat ?? endBeat;
  const writtenBars = starts.map((start, index) => {
    const next = starts[index + 1];
    const nominal = barLengthInBeats(timeSignatures[Math.max(0, lastAtOrBefore(timeSignatures, start + 1e-9, (t) => t.beat))]);
    const length = next !== undefined ? next - start : end - start > 0 ? Math.min(nominal, end - start) : nominal;
    return { start, length, navigation: music.navigation?.[index] ?? {} };
  });

  return {
    title,
    notes: sortedNotes,
    bars: barPairs.map((bar) => bar.time),
    barBeats,
    barWritten: music.barWritten ? barPairs.map((bar) => bar.written) : barBeats.map((_, i) => i),
    duration,
    endBeat,
    pedal: [...(music.pedal ?? [])].sort((a, b) => a.start - b.start),
    sostenutoPedal: [...(music.sostenutoPedal ?? [])].sort((a, b) => a.start - b.start),
    softPedal: [...(music.softPedal ?? [])].sort((a, b) => a.start - b.start),
    timeMap: music.timeMap
      ? [...music.timeMap].sort((a, b) => a.beat - b.beat)
      : evenTimeMap(barPairs, { time: duration, beat: endBeat }),
    graceSounds: music.graceSounds ?? [],
    notation: {
      title,
      bars: writtenBars,
      notes: music.written ?? [],
      graces: music.graces ?? [],
      rests: music.rests ?? [],
      clefs: [...(music.clefs ?? [])].sort((a, b) => a.beat - b.beat),
      keySignatures: fromBeatZero(music.keySignatures, DEFAULT_KEY_SIGNATURE, (a, b) => a.fifths === b.fifths && a.minor === b.minor),
      timeSignatures,
      tempos: music.tempos ?? [],
      tempoMarks: [...(music.tempoMarks ?? [])].sort((a, b) => a.beat - b.beat),
      pedalMoves: music.pedalMoves ?? [],
      pedalMarks: [...(music.pedalMarks ?? [])].sort((a, b) => a.beat - b.beat),
      octaveShifts: [...(music.octaveShifts ?? [])].sort((a, b) => a.start - b.start),
      dynamics: [...(music.dynamics ?? [])].sort((a, b) => a.beat - b.beat),
      hairpins: [...(music.hairpins ?? [])].sort((a, b) => a.start - b.start),
      dynamicLevels: music.dynamicLevels ?? [],
    },
  };
}

/** Without a better map: time runs evenly from each bar start to the next, and on to the end. */
function evenTimeMap(bars: readonly { time: number; beat: number }[], end: { time: number; beat: number }): TimePoint[] {
  const points: TimePoint[] = bars.map(({ time, beat }) => ({ beat, time }));
  const last = points.at(-1);
  if (last && end.beat > last.beat && end.time > last.time) points.push(end);
  return points;
}

export const EMPTY_SCORE: Score = createScore('', [], []);

/** Seconds per quarter note when a map has nothing to go by (120 BPM). */
const FALLBACK_SECONDS_PER_BEAT = 0.5;

/** Index of the time-map point at or before `value` of `key` (0 before the first). */
const segmentOf = (map: readonly TimePoint[], key: 'beat' | 'time', value: number): number =>
  Math.max(0, lastAtOrBefore(map, value, (point) => point[key]));

/** Seconds per beat along segment `i` (the last segment's pace continues past the end). */
function paceOf(map: readonly TimePoint[], i: number): number {
  const [a, b] = i + 1 < map.length ? [map[i], map[i + 1]] : [map[i - 1], map[i]];
  if (!a || !b || b.beat <= a.beat) return FALLBACK_SECONDS_PER_BEAT;
  return (b.time - a.time) / (b.beat - a.beat);
}

/** When quarter note `beat` (as played) sounds, in seconds. */
export function secondsAtBeat(score: Score, beat: number): number {
  const map = score.timeMap;
  if (map.length === 0) return beat * FALLBACK_SECONDS_PER_BEAT;
  const i = segmentOf(map, 'beat', beat);
  return map[i].time + (beat - map[i].beat) * paceOf(map, i);
}

/** Which quarter note (as played) sounds at `time` seconds: the inverse of secondsAtBeat. */
export function beatAtSeconds(score: Score, time: number): number {
  const map = score.timeMap;
  if (map.length === 0) return time / FALLBACK_SECONDS_PER_BEAT;
  const i = segmentOf(map, 'time', time);
  const pace = paceOf(map, i);
  return map[i].beat + (pace > 0 ? (time - map[i].time) / pace : 0);
}

/** Whether `beat` falls strictly inside a held stretch (a fermata). */
export function isHeldAt(score: Score, beat: number): boolean {
  const map = score.timeMap;
  const i = segmentOf(map, 'beat', beat);
  const next = map[i + 1];
  return !!map[i]?.hold && beat > map[i].beat + 1e-9 && (next === undefined || beat < next.beat - 1e-9);
}

const itself = (value: number) => value;

/** Zero-based index of the bar that contains `time`. */
export const barAt = (score: Score, time: number): number =>
  Math.max(0, lastAtOrBefore(score.bars, time, itself));

/** The printed bar that contains `beat` (quarter notes along the page). */
export const barAtBeat = (score: Score, beat: number): number =>
  Math.max(0, lastAtOrBefore(score.notation.bars, beat + 1e-9, (bar) => bar.start));

/** How many quarter notes printed bar `index` lasts. */
export const barLength = (score: Score, index: number): number => score.notation.bars[index].length;

/** Where the music ends along the page, in quarter notes: the end of the last printed bar. */
export function pageEnd(score: Score): number {
  const last = score.notation.bars.at(-1);
  return last ? last.start + last.length : 0;
}

/**
 * Whether the piece opens with a pickup (anacrusis): a first bar shorter than its time signature,
 * like the two sixteenths before the first full bar of Für Elise.
 */
export const hasPickup = (score: Score): boolean =>
  score.notation.bars.length > 1 && barLength(score, 0) < barLengthInBeats(timeSignatureAt(score, 0)) - 1e-6;

/** The number printed on printed bar `written`: a pickup is bar 0, the first full bar is 1. */
export const writtenBarNumber = (score: Score, written: number): number => written + (hasPickup(score) ? 0 : 1);

/** The printed number of bar `index` as played (zero-based): repeated bars keep their number. */
export const barNumber = (score: Score, index: number): number =>
  writtenBarNumber(score, score.barWritten[index] ?? index);

/**
 * Which playing of printed bar `written` is nearest to `near` (seconds): with repeats a bar on the
 * page is played more than once, and a click on it means the pass one is on (or closest to).
 */
export function playedBarNear(score: Score, written: number, near: number): number {
  let best = -1;
  let bestDistance = Infinity;
  score.barWritten.forEach((w, i) => {
    if (w !== written) return;
    const start = score.bars[i];
    const end = score.bars[i + 1] ?? score.duration;
    const distance = near < start ? start - near : near > end ? near - end : 0;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best >= 0 ? best : Math.min(Math.max(0, written), score.bars.length - 1);
}

/** The bar as played carrying printed `number`, on the pass nearest to `near` (seconds). */
export const barIndexNear = (score: Score, number: number, near: number): number =>
  playedBarNear(score, number - (hasPickup(score) ? 0 : 1), near);

/** When `beat` along the page, in printed bar `written`, sounds on the pass nearest to `near`. */
export function timeAtPage(score: Score, written: number, beat: number, near: number): number {
  const index = playedBarNear(score, written, near);
  const start = score.bars[index];
  const end = score.bars[index + 1] ?? score.duration;
  const offset = beat - (score.notation.bars[written]?.start ?? 0);
  return Math.min(end, Math.max(start, secondsAtBeat(score, score.barBeats[index] + offset)));
}

/** Time range covering bars `from..to` inclusive (zero-based). */
export function barRange(score: Score, from: number, to: number): TimeRange {
  const last = score.bars.length - 1;
  const first = Math.min(Math.max(0, Math.min(from, to)), last);
  const final = Math.min(Math.max(0, Math.max(from, to)), last);
  return { start: score.bars[first], end: score.bars[final + 1] ?? score.duration };
}

/** Index of the first note that starts at or after `time`. */
export const firstNoteAtOrAfter = (score: Score, time: number): number =>
  firstAtOrAfter(score.notes, time, (note) => note.start);

/** The time signature in force at `beat`. */
export const timeSignatureAt = (score: Score, beat: number): TimeSignature =>
  score.notation.timeSignatures[Math.max(0, lastAtOrBefore(score.notation.timeSignatures, beat, (s) => s.beat))];

/** The metronome mark in force at `beat` along the page, if the source gives one. */
export function tempoMarkAt(score: Score, beat: number): TempoMark | null {
  const index = lastAtOrBefore(score.notation.tempoMarks, beat + 1e-9, (mark) => mark.beat);
  return score.notation.tempoMarks[Math.max(0, index)] ?? null;
}

/** The key signature in force at `beat`. */
export const keySignatureAt = (score: Score, beat: number): KeySignature =>
  score.notation.keySignatures[Math.max(0, lastAtOrBefore(score.notation.keySignatures, beat, (s) => s.beat))];

/** Where `time` (seconds, as played) falls on the page: the printed bar and how far through it. */
export function writtenPositionAt(score: Score, time: number): { bar: number; fraction: number } {
  const index = barAt(score, time);
  const start = score.bars[index];
  const end = score.bars[index + 1] ?? score.duration;
  const fraction = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
  return { bar: score.barWritten[index] ?? index, fraction };
}

/** The beat along the page (quarter notes) that is sounding at `time`. */
export function writtenBeatAt(score: Score, time: number): number {
  const { bar, fraction } = writtenPositionAt(score, time);
  return score.notation.bars[bar].start + fraction * barLength(score, bar);
}

/**
 * Where the bars start, in quarter notes, for music of `end` quarter notes with these time
 * signatures (4/4 until the first one): each bar is as long as the metre in force says.
 */
export function barStarts(timeSignatures: readonly TimeSignature[], end: number): number[] {
  const sorted = [...timeSignatures].sort((a, b) => a.beat - b.beat);
  if (sorted.length === 0 || sorted[0].beat > 0) sorted.unshift({ beat: 0, numerator: 4, denominator: 4 });
  const bars: number[] = [];
  sorted.forEach((signature, i) => {
    const until = sorted[i + 1]?.beat ?? end;
    const length = barLengthInBeats(signature);
    for (let beat = signature.beat; beat < until - 1e-9; beat += length) bars.push(beat);
  });
  return bars;
}

/** How many quarter notes a bar of this metre lasts: 3/4 → 3, 6/8 → 3, 2/2 → 4. */
export function barLengthInBeats({ numerator, denominator }: TimeSignature): number {
  return (numerator * 4) / denominator;
}

/** The clef in force on a staff (1 upper, 2 lower) at `beat`. */
export function clefAt(score: Score, staff: number, beat: number): Clef {
  let clef: Clef = staff === 1 ? 'treble' : 'bass';
  for (const change of score.notation.clefs) {
    if (change.beat > beat + 1e-9) break;
    if (change.staff === staff) clef = change.clef;
  }
  return clef;
}
