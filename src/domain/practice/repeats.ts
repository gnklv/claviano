import { SAME_MOMENT } from '../moment';
import type { Hand } from '../note';
import type { Score } from '../score';
import type { Part } from './parts';

/*
 * Bars that are written out again note for note (a chorus, a theme come back) are learnt once: the
 * second time they are the same notes under the same hands, and what is to be practised is only
 * the way into them and out, which the joins and the whole piece play. So is a hand's line come back
 * under another one in the other hand (a waltz's left hand, the same for many bars of tune): it is
 * learnt alone once, and then played with the new line.
 */

/** What a span of bars plays (or one hand in it), the same text wherever the same music is written: its bars' lengths, and each note by hand, pitch and place within the span. */
export function musicOf(score: Score, part: Part, hand?: Hand): string {
  const { bars, notes } = score.notation;
  const start = bars[part.from]!.start;
  const at = (beat: number) => Math.round(beat / SAME_MOMENT);
  const lengths = bars.slice(part.from, part.to + 1).map((bar) => at(bar.length));
  const played = notes
    .filter((note) => note.bar >= part.from && note.bar <= part.to && (hand === undefined || note.hand === hand))
    .map((note) => `${note.hand} ${note.sounding} ${at(note.beat - start)} ${at(note.beats)}`)
    .sort();
  return `${lengths.join(' ')}|${played.join(',')}`;
}
