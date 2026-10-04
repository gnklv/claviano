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
