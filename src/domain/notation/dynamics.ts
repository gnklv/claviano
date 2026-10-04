/*
 * Dynamics: how loud the music is along the page. Printed marks (p, mf, ff…) set a level; hairpins
 * and the words "cresc." / "dim." move smoothly from the level where they start to the next mark.
 * Levels are MusicXML's: a percentage of forte as MuseScore writes it (f is 106.67).
 */

/** A dynamic mark as printed: letters (pp, mf, sfz…) or words (cresc., dim.), at `beat` along the page. */
export interface DynamicMark {
  readonly beat: number;
  /** Where it is printed: between the staves (most marks), or under the lower staff. */
  readonly below: boolean;
  readonly text: string;
  /** Letters drawn with the music font (pp, mf…), or words in italics (cresc.). */
  readonly letters: boolean;
}

/** A crescendo or diminuendo hairpin, or the stretch of "cresc." / "dim." words, along the page. */
export interface Hairpin {
  readonly start: number;
  readonly end: number;
  readonly type: 'crescendo' | 'diminuendo';
  readonly below: boolean;
  /** Drawn as a hairpin; false for words, which only sound. */
  readonly drawn: boolean;
}

/** A sudden stress written as a dynamic (sf, fp…), on the notes at `beat`: louder by `factor`, or at `level`. */
export interface DynamicAccent {
  readonly beat: number;
  readonly level?: number;
  readonly factor: number;
}

/** A level set at `beat` along the page, from a mark or a <sound dynamics>. */
export interface DynamicLevel {
  readonly beat: number;
  readonly level: number;
}

/** MuseScore's levels for the usual marks (MusicXML <sound dynamics>). */
export const MARK_LEVELS: Readonly<Record<string, number>> = {
  pppp: 1.11,
  ppp: 18.89,
  pp: 36.67,
  p: 54.44,
  mp: 71.11,
  mf: 88.89,
  f: 106.67,
  ff: 124.44,
  fff: 142.22,
  ffff: 160,
};

/** How far a hairpin with no mark after it moves: one step (p to mp, f to ff). */
export const LEVEL_STEP = MARK_LEVELS.f - MARK_LEVELS.mf;

/**
 * The loudness at `beat` along the page: the last level set at or before it, or, inside a hairpin,
 * a straight line from the level at the hairpin's start to its target at the end: the next level
 * set at or after the end (up to a bar later), or one step up or down when none follows.
 */
export function levelAt(levels: readonly DynamicLevel[], hairpins: readonly Hairpin[], beat: number, fallback: number): number {
  const at = (b: number) => {
    let level = fallback;
    for (const point of levels) {
      if (point.beat > b + 1e-9) break;
      level = point.level;
    }
    return level;
  };
  const hairpin = hairpins.find((h) => beat >= h.start - 1e-9 && beat < h.end - 1e-9);
  if (!hairpin) return at(beat);

  const from = at(hairpin.start);
  const step = hairpin.type === 'crescendo' ? LEVEL_STEP : -LEVEL_STEP;
  // The next mark after the hairpin starts is where it is heading, if it goes the right way.
  const next = levels.find((point) => point.beat > hairpin.start + 1e-9);
  const heading = next && next.beat <= hairpin.end + HAIRPIN_TARGET_REACH && Math.sign(next.level - from) === Math.sign(step);
  const to = heading ? next.level : Math.max(1, from + step);
  // A mark inside the hairpin is reached there; from it on, its level holds.
  const end = heading && next.beat < hairpin.end ? next.beat : hairpin.end;
  if (beat >= end - 1e-9) return at(beat);
  const share = (beat - hairpin.start) / (end - hairpin.start);
  return from + (to - from) * share;
}

/** How far after a hairpin's end (in quarter notes) a mark still counts as its target. */
const HAIRPIN_TARGET_REACH = 4;

/**
 * The levels set along the page, plus where hairpins with no mark to head for leave the music:
 * one step louder or softer at their end, holding until the next mark.
 */
export function withHairpinLevels(levels: readonly DynamicLevel[], hairpins: readonly Hairpin[], fallback: number): DynamicLevel[] {
  const result = [...levels].sort((a, b) => a.beat - b.beat);
  for (const hairpin of [...hairpins].sort((a, b) => a.start - b.start)) {
    const next = result.find((point) => point.beat > hairpin.start + 1e-9);
    const from = levelAt(result, [], hairpin.start, fallback);
    const up = hairpin.type === 'crescendo';
    const heading = next && next.beat <= hairpin.end + HAIRPIN_TARGET_REACH && next.level > from === up;
    if (heading) continue;
    result.push({ beat: hairpin.end, level: Math.max(1, from + (up ? LEVEL_STEP : -LEVEL_STEP)) });
    result.sort((a, b) => a.beat - b.beat);
  }
  return result;
}

/**
 * Marks that stress a note rather than set a level: sf, sfz, fz, rf… make it louder; fp and sfp
 * play it forte (sfp stressed too), and from then on piano (sfpp: pianissimo).
 */
const STRESS_MARKS: Readonly<Record<string, { factor: number; level?: string; after?: string }>> = {
  sf: { factor: 1.35 },
  sfz: { factor: 1.35 },
  sffz: { factor: 1.5 },
  fz: { factor: 1.35 },
  rf: { factor: 1.25 },
  rfz: { factor: 1.25 },
  fp: { factor: 1, level: 'f', after: 'p' },
  sfp: { factor: 1.35, level: 'f', after: 'p' },
  sfpp: { factor: 1.35, level: 'f', after: 'pp' },
};

/** Words that make the music louder or softer until the next mark, like a hairpin. */
const CRESCENDO_WORDS = /^(cresc|crescendo)\b/i;
const DIMINUENDO_WORDS = /^(dim|dimin|diminuendo|decresc|decrescendo)\b/i;
/** How far "cresc." and "dim." reach when no mark follows (quarter notes): about a bar. */
const WORDS_REACH = 4;

/** Whether words printed in the music are a dynamic: "cresc.", "dim." and the like. */
export function dynamicWords(text: string): Hairpin['type'] | null {
  return CRESCENDO_WORDS.test(text) ? 'crescendo' : DIMINUENDO_WORDS.test(text) ? 'diminuendo' : null;
}

/** Whether a mark is letters of the dynamics alphabet (pp, mf, sfz…), drawn in the music font. */
export const isDynamicLetters = (text: string): boolean => /^[pmfrszn]+$/.test(text);

/** A dynamic mark as written, with the level the source gives it when that is not the mark's usual one. */
export interface NotatedDynamic extends DynamicMark {
  readonly level?: number;
}

/**
 * What the dynamics printed along the page mean for playing:
 * - a mark sets a level from its place on (its usual one, or the one the source gives it);
 * - a stress mark (sfz, fp…) accents the notes it is written at, and "fp" leaves the music soft;
 * - the words "cresc." and "dim." act like hairpins up to the next mark; where a drawn hairpin
 *   starts at the same place, it decides: it says how far the change goes.
 * `levels`: levels set with no mark printed.
 */
export function dynamicsAlongPage(
  marks: readonly NotatedDynamic[],
  levels: readonly DynamicLevel[],
  hairpins: readonly Hairpin[],
): { levels: DynamicLevel[]; hairpins: Hairpin[]; accents: DynamicAccent[] } {
  const result = { levels: [] as DynamicLevel[], hairpins: [...hairpins], accents: [] as DynamicAccent[] };
  for (const mark of marks) {
    const stress = mark.letters ? STRESS_MARKS[mark.text] : undefined;
    if (stress) result.accents.push({ beat: mark.beat, factor: stress.factor, level: stress.level ? MARK_LEVELS[stress.level] : undefined });
    const usual = !mark.letters ? undefined : stress ? (stress.after ? MARK_LEVELS[stress.after] : undefined) : MARK_LEVELS[mark.text];
    const level = mark.level ?? usual;
    if (level !== undefined) result.levels.push({ beat: mark.beat, level });
    const words = mark.letters ? null : dynamicWords(mark.text);
    if (words) result.hairpins.push({ start: mark.beat, end: mark.beat + WORDS_REACH, type: words, below: mark.below, drawn: false });
  }
  result.levels.push(...levels);
  // Drawn hairpins before words that start with them (the first one found at a place is followed).
  result.hairpins.sort((a, b) => a.start - b.start || Number(b.drawn) - Number(a.drawn));
  return result;
}
