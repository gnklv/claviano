import { pageEnd, type Score } from '../score';

/*
 * Pedal marks. A passage is a pedal from a press to its release. The right pedal is printed under
 * the lower staff either with signs ("Ped." … "✱"), with a bracket line (⌊___∧___⌋, the notch
 * being a change), or with both ("Ped." followed by a line). The middle pedal is "Sost." and a
 * line; the left pedal is words ("una corda" … "tre corde"). Places are beats along the page.
 */

/** "Ped." (press), "Sost." (middle pedal press) or "✱" (release) at `beat`. */
export interface PedalSign {
  readonly beat: number;
  readonly kind: 'press' | 'sostenuto' | 'release';
}

/** A bracket line from `from` to `to`, with a notch at every change. */
export interface PedalLine {
  readonly pedal: 'sustain' | 'sostenuto';
  readonly from: number;
  readonly to: number;
  readonly changes: readonly number[];
  /** Starts after a "Ped." (or "Sost.") sign instead of with an upward hook. */
  readonly afterSign: boolean;
}

/** Words of the left pedal at `beat`. */
export interface PedalWords {
  readonly beat: number;
  readonly text: string;
}

export interface PedalLayout {
  readonly signs: readonly PedalSign[];
  readonly lines: readonly PedalLine[];
  readonly words: readonly PedalWords[];
}

const layoutCache = new WeakMap<Score, PedalLayout>();

export function engravePedal(score: Score): PedalLayout {
  const cached = layoutCache.get(score);
  if (cached) return cached;

  const signs: PedalSign[] = [];
  const lines: PedalLine[] = [];

  for (const pedal of ['sustain', 'sostenuto'] as const) {
    const pressSign = pedal === 'sustain' ? 'press' : 'sostenuto';
    // (Cast so the compiler does not assume it stays null: the helpers below change it.)
    let open = null as { from: number; sign: boolean; line: boolean; changes: number[] } | null;

    const close = (beat: number) => {
      if (!open) return;
      if (open.line) lines.push({ pedal, from: open.from, to: beat, changes: open.changes, afterSign: open.sign });
      else if (open.sign) signs.push({ beat, kind: 'release' });
      open = null;
    };
    const press = (beat: number, style: { sign: boolean; line: boolean }) => {
      open = { from: beat, sign: style.sign, line: style.line, changes: [] };
      if (style.sign) signs.push({ beat, kind: pressSign });
    };

    for (const mark of score.notation.pedalMarks) {
      if (mark.pedal !== pedal) continue;
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
    close(pageEnd(score));
  }

  const words = score.notation.pedalMarks.flatMap((mark) => (mark.pedal === 'soft' && mark.text ? [{ beat: mark.beat, text: mark.text }] : []));

  const layout = { signs, lines, words };
  layoutCache.set(score, layout);
  return layout;
}
