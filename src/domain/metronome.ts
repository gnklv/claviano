import {
  barLengthInBeats,
  beatAtSeconds,
  hasPickup,
  isHeldAt,
  secondsAtBeat,
  timeSignatureAt,
  type Score,
  type TimeSignature,
} from './score';

/*
 * The metronome: a click on every beat, the first of each bar accented. Beats are counted the way
 * musicians count: in compound metres (6/8, 9/8, 12/8) by dotted quarters, otherwise by the
 * time signature's note value (4/4 by quarters, 3/8 by eighths, 2/2 by halves).
 */

export interface Click {
  /** Seconds, as played. */
  readonly time: number;
  /** The first beat of a bar. */
  readonly accent: boolean;
}

/** How a metre is counted: beats per bar, and each beat's length in quarter notes. */
export function beatsOf({ numerator, denominator }: TimeSignature): { count: number; length: number } {
  const compound = denominator >= 8 && numerator > 3 && numerator % 3 === 0;
  return compound ? { count: numerator / 3, length: (3 * 4) / denominator } : { count: numerator, length: 4 / denominator };
}

/** The time signature of bar `index` as played (signatures are placed along the page). */
function signatureOfBar(score: Score, index: number): TimeSignature {
  const written = score.barWritten[index] ?? index;
  return timeSignatureAt(score, score.writtenBarBeats[written] ?? score.barBeats[index]);
}

/**
 * Every click of the piece, in time order, along the bars as played. A pickup is counted from the
 * end, so its last beat leads into the first full bar's accent; no click falls inside a fermata.
 */
export function metronomeClicks(score: Score): Click[] {
  const clicks: Click[] = [];
  if (score.notes.length === 0) return clicks;
  score.barBeats.forEach((start, i) => {
    const signature = signatureOfBar(score, i);
    const { count, length } = beatsOf(signature);
    const end = score.barBeats[i + 1] ?? start + barLengthInBeats(signature);
    // A pickup is the end of a bar: its beats line up with where a full bar would have them.
    const pickup = (score.barWritten[i] ?? i) === 0 && hasPickup(score);
    const offset = pickup ? Math.max(0, count * length - (end - start)) : 0;
    for (let k = 0; k < count; k++) {
      const beat = start - offset + k * length;
      if (beat < start - 1e-9 || beat > end - 1e-9) continue;
      if (isHeldAt(score, beat)) continue;
      const time = secondsAtBeat(score, beat);
      if (time > score.duration + 1e-9) continue;
      clicks.push({ time, accent: k === 0 });
    }
  });
  return clicks;
}

/** One count-in click: how long before the music it sounds (seconds at 100% tempo), and the number counted. */
export interface CountInClick {
  readonly before: number;
  readonly count: number;
}

/**
 * The count-in before playing from `time`, the way musicians count: the beats of the bar leading
 * up to where the music comes in, so that it enters on its own beat. A pickup on the fourth beat
 * of 4/4 is counted "1 2 3"; the start of a bar gets a whole bar, "1 2 3 4". When fewer than two
 * beats would lead in (starting on beat 2), a whole bar goes before them. Beats are as long as
 * at that point of the piece.
 */
export function countIn(score: Score, time: number): CountInClick[] {
  const start = beatAtSeconds(score, time);
  let bar = 0;
  while (bar + 1 < score.barBeats.length && score.barBeats[bar + 1] <= start + 1e-9) bar++;
  const signature = signatureOfBar(score, bar);
  const { count, length } = beatsOf(signature);

  // Where this bar's beat grid starts: a pickup's beats line up with the end of a full bar.
  const barStart = score.barBeats[bar] ?? 0;
  const barEnd = score.barBeats[bar + 1] ?? barStart + barLengthInBeats(signature);
  const pickup = (score.barWritten[bar] ?? bar) === 0 && hasPickup(score);
  const gridStart = barStart - (pickup ? Math.max(0, count * length - (barEnd - barStart)) : 0);

  // Beats of the grid before the start, in this bar; then, if too few, a whole bar more.
  const inBar = Math.ceil((start - gridStart) / length - 1e-9);
  const beats = inBar >= 2 ? inBar : inBar + count;
  const secondsPerQuarter = (secondsAtBeat(score, start + length) - secondsAtBeat(score, start)) / length || 0.5;
  const clicks: CountInClick[] = [];
  for (let k = inBar - beats; k < inBar; k++) {
    const beat = gridStart + k * length;
    clicks.push({ before: (start - beat) * secondsPerQuarter, count: (((k % count) + count) % count) + 1 });
  }
  return clicks;
}
