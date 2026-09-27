/*
 * How a score is navigated: repeat signs, first and second endings (voltas), and the jumps
 * D.C. (da capo), D.S. (dal segno), Fine and Coda. Printed bars are played in an order that
 * differs from the page; `performanceOrder` works that order out.
 */

/** What a printed bar says about navigation. */
export interface BarNavigation {
  /** ‖: — a repeated passage starts here. */
  readonly repeatStart?: boolean;
  /** :‖ — go back to the repeat start; `times` is how often the passage is played in total (usually 2). */
  readonly repeatEnd?: { readonly times: number };
  /** Inside a volta: the passes on which this bar is played, e.g. [1] or [2]. */
  readonly ending?: readonly number[];
  /** 𝄋 — the target of D.S. */
  readonly segno?: boolean;
  /** 𝄌 — the target of "To Coda". */
  readonly coda?: boolean;
  /** After this bar: go back to the beginning (D.C.) or to the segno (D.S.). */
  readonly jump?: 'dacapo' | 'dalsegno';
  /** The piece ends after this bar, once a D.C. or D.S. has been taken. */
  readonly fine?: boolean;
  /** Jump to the coda after this bar, once a D.C. or D.S. has been taken. */
  readonly toCoda?: boolean;

  // What the staff draws (the flags above are what playback follows).
  /** The volta bracket's label, e.g. "1." or "1, 2."; set on the first bar of an ending. */
  readonly endingLabel?: string;
  /** The volta bracket ends with a downward hook after this bar (the last ending is often open). */
  readonly endingClosed?: boolean;
  /** 𝄋 or 𝄌 printed over the start of this bar. */
  readonly segnoSign?: boolean;
  readonly codaSign?: boolean;
  /** Words printed over this bar, like "D.C. al Fine", "Fine" or "To Coda". */
  readonly text?: string;
}

/** A score that never ends by mistake still stops: no piece repeats itself this often. */
const MAX_REPEAT_FACTOR = 16;

/**
 * The order printed bars are played in, as indices into `bars`.
 *
 * The usual conventions: a repeat goes back to the last ‖: (or to the start); in a volta, a bar is
 * played on the passes its ending lists; after D.C. or D.S. repeats are not taken again, the last
 * ending is played, and Fine / To Coda come into force.
 */
export function performanceOrder(bars: readonly BarNavigation[]): number[] {
  const order: number[] = [];
  const lastEnding = lastEndingNumbers(bars);
  const segno = bars.findIndex((bar) => bar.segno);
  const coda = bars.findIndex((bar) => bar.coda);

  let index = 0;
  let repeatStart = 0;
  let pass = 1;
  const timesPlayed = new Map<number, number>(); // repeat end bar → passes played so far
  let jumped = false; // a D.C. / D.S. has been taken
  let wentBack = false; // we just returned here from a :‖

  while (index < bars.length && order.length < bars.length * MAX_REPEAT_FACTOR) {
    const bar = bars[index];
    if (bar.repeatStart) {
      // Reaching ‖: in the normal flow starts a new passage; returning to it keeps counting.
      if (!wentBack) pass = 1;
      repeatStart = index;
    }
    wentBack = false;

    // A volta bar is skipped on passes it does not belong to; after a jump only the last ending plays.
    if (bar.ending) {
      const plays = jumped ? bar.ending.includes(lastEnding.get(index) ?? Math.max(...bar.ending)) : bar.ending.includes(pass);
      if (!plays) {
        index++;
        continue;
      }
    }

    order.push(index);

    if (jumped && bar.fine) break;
    if (jumped && bar.toCoda && coda >= 0) {
      index = coda;
      continue;
    }

    if (bar.repeatEnd && !jumped) {
      const played = timesPlayed.get(index) ?? 1;
      if (played < bar.repeatEnd.times) {
        timesPlayed.set(index, played + 1);
        pass = played + 1;
        index = repeatStart;
        wentBack = true;
        continue;
      }
      // Done with this passage: whatever follows starts a new one.
      timesPlayed.delete(index);
      repeatStart = index + 1;
      pass = 1;
    }

    if (bar.jump && !jumped) {
      jumped = true;
      pass = 1;
      index = bar.jump === 'dalsegno' && segno >= 0 ? segno : 0;
      continue;
    }

    index++;
  }
  return order;
}

/** For every volta bar, the highest ending number of its group of voltas (the one played last). */
function lastEndingNumbers(bars: readonly BarNavigation[]): Map<number, number> {
  const result = new Map<number, number>();
  let group: number[] = [];
  const close = () => {
    const last = Math.max(...group.flatMap((i) => bars[i].ending ?? []));
    for (const i of group) result.set(i, last);
    group = [];
  };
  bars.forEach((bar, i) => {
    if (bar.ending) group.push(i);
    else if (group.length > 0) close();
  });
  if (group.length > 0) close();
  return result;
}
