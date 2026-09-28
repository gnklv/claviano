import { barAtBeat, type Score } from '../../domain/score';
import { beatPosition } from './staffLayout';

/*
 * Pedal marks under the lower staff. A passage is the pedal from a press to its release; it is
 * printed either with signs ("Ped." … "✱"), with a bracket line (⌊___∧___⌋, the notch being a
 * change), or with both ("Ped." followed by a line). Positions are in bar units, like notes.
 */

/** "Ped." (press) or "✱" (release) at `x`. */
export interface PedalSign {
  readonly x: number;
  readonly kind: 'press' | 'release';
}

/** A bracket line from `from` to `to`, with a notch at every change. */
export interface PedalLine {
  readonly from: number;
  readonly to: number;
  readonly changes: readonly number[];
  /** Starts after a "Ped." sign instead of with an upward hook. */
  readonly afterSign: boolean;
}

export interface PedalLayout {
  readonly signs: readonly PedalSign[];
  readonly lines: readonly PedalLine[];
}

const layoutCache = new WeakMap<Score, PedalLayout>();

export function layoutPedal(score: Score): PedalLayout {
  const cached = layoutCache.get(score);
  if (cached) return cached;

  const signs: PedalSign[] = [];
  const lines: PedalLine[] = [];
  const x = (beat: number) => beatPosition(score, barAtBeat(score, beat), beat);
  // (Cast so the compiler does not assume it stays null: the helpers below change it.)
  let open = null as { from: number; sign: boolean; line: boolean; changes: number[] } | null;

  const close = (beat: number) => {
    if (!open) return;
    if (open.line) lines.push({ from: x(open.from), to: x(beat), changes: open.changes.map(x), afterSign: open.sign });
    else if (open.sign) signs.push({ x: x(beat), kind: 'release' });
    open = null;
  };
  const press = (beat: number, style: { sign: boolean; line: boolean }) => {
    open = { from: beat, sign: style.sign, line: style.line, changes: [] };
    if (style.sign) signs.push({ x: x(beat), kind: 'press' });
  };

  for (const mark of score.pedalMarks) {
    if (mark.type === 'start') {
      close(mark.beat); // a missing release: the new press implies it
      press(mark.beat, mark);
    } else if (mark.type === 'change') {
      if (!open) press(mark.beat, mark);
      else if (open.line) open.changes.push(mark.beat);
      else {
        // With signs only, a change is a release and a new press: "✱Ped.".
        const style = { sign: open.sign, line: false };
        close(mark.beat);
        press(mark.beat, style);
      }
    } else {
      close(mark.beat);
    }
  }
  close(score.writtenEndBeat);

  const layout = { signs, lines };
  layoutCache.set(score, layout);
  return layout;
}
