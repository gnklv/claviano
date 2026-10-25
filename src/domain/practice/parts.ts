import { sameMoment } from '../moment';
import { hasPickup, type Score } from '../score';

/*
 * A piece in parts to be learnt one by one, as a teacher marks them out: by its form first (a
 * repeat, a volta, a new key or metre begins a section), and within a section by phrases of about
 * four bars. Experts practise in the parts of a piece's form, and remember it by them (Chaffin,
 * 2002); four bars is a phrase in most of what is learnt at the piano.
 */

/** A part: printed bars `from..to`, both counted (indices into `score.notation.bars`). */
export interface Part {
  readonly from: number;
  readonly to: number;
}

/**
 * A phrase is this many bars; what is left over at a section's end is joined to its last phrase, or
 * stands alone from this many. A section shorter than that too (a volta of a bar, a coda of two)
 * is no part to learn by itself: it is joined to the section before it.
 */
const PHRASE = 4;
const OWN_PHRASE = 3;

/** The piece in parts, from its first printed bar to its last, in order. */
export function partsOf(score: Score): Part[] {
  const bars = score.notation.bars;
  if (bars.length === 0) return [];
  const sections: Part[] = [];
  let start = 0;
  for (let bar = 1; bar <= bars.length; bar++) {
    if (bar < bars.length && !beginsSection(score, bar)) continue;
    sections.push({ from: start, to: bar - 1 });
    start = bar;
  }
  const joined: Part[] = [];
  for (const section of sections) {
    const before = joined.at(-1);
    if (before && (counted(score, section) < OWN_PHRASE || counted(score, before) < OWN_PHRASE)) joined[joined.length - 1] = { from: before.from, to: section.to };
    else joined.push(section);
  }
  return joined.flatMap((section) => phrases(score, section.from, section.to));
}

/** How many bars of a part are learnt as bars (a pickup leads into the first: it is not one). */
const counted = (score: Score, part: Part): number => part.to - part.from + 1 - (part.from === 0 && hasPickup(score) ? 1 : 0);

/** Whether a new section begins with printed bar `bar`: a repeat, a volta, a sign to jump to, a new key or metre. */
function beginsSection(score: Score, bar: number): boolean {
  const { bars, keySignatures, timeSignatures } = score.notation;
  const here = bars[bar]!.navigation;
  const before = bars[bar - 1]!.navigation;
  const start = bars[bar]!.start;
  const changes = (marks: readonly { readonly beat: number }[]) => marks.some((mark) => mark.beat > 0 && sameMoment(mark.beat, start));
  return Boolean(here.repeatStart || before.repeatEnd || here.endingLabel || here.segno || here.coda || before.jump || before.fine || before.toCoda || changes(keySignatures) || changes(timeSignatures));
}

/** A section's bars in phrases of four, the last one taking what is left over (a pickup joins the first). */
function phrases(score: Score, from: number, to: number): Part[] {
  // (A pickup is not a bar of its own to learn: it leads into the first.)
  const counted = from === 0 && hasPickup(score) && to > 0 ? 1 : from;
  const parts: Part[] = [];
  let start = counted;
  while (to - start + 1 > PHRASE) {
    const left = to - (start + PHRASE) + 1;
    if (left < OWN_PHRASE) break;
    parts.push({ from: start, to: start + PHRASE - 1 });
    start += PHRASE;
  }
  parts.push({ from: start, to });
  if (counted !== from) parts[0] = { from, to: parts[0]!.to };
  return parts;
}
