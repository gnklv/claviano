import { describe, expect, it } from 'vitest';
import {
  dynamicsAlongPage,
  dynamicWords,
  LEVEL_STEP,
  levelAt,
  MARK_LEVELS,
  withHairpinLevels,
  type DynamicMark,
  type Hairpin,
} from '../src/domain/notation/dynamics';

const { p, mf, f } = MARK_LEVELS;
const hairpin = (start: number, end: number, type: Hairpin['type'] = 'crescendo'): Hairpin => ({
  start,
  end,
  type,
  below: false,
  drawn: true,
});

describe('levelAt', () => {
  it('holds each mark until the next', () => {
    const levels = [
      { beat: 0, level: p },
      { beat: 4, level: f },
    ];
    expect(levelAt(levels, [], 2, mf)).toBe(p);
    expect(levelAt(levels, [], 4, mf)).toBe(f);
  });

  it('rises through a crescendo towards the mark it leads to', () => {
    const levels = [
      { beat: 0, level: p },
      { beat: 4, level: f },
    ];
    const cresc = [hairpin(0, 4)];
    expect(levelAt(levels, cresc, 0, mf)).toBe(p);
    expect(levelAt(levels, cresc, 2, mf)).toBeCloseTo((p + f) / 2);
    expect(levelAt(levels, cresc, 4, mf)).toBe(f);
  });

  it('reaches a mark inside the hairpin there, and holds it', () => {
    const levels = [
      { beat: 0, level: p },
      { beat: 2, level: f },
    ];
    expect(levelAt(levels, [hairpin(0, 4)], 3, mf)).toBe(f);
  });
});

describe('withHairpinLevels', () => {
  it('lets a hairpin with no mark after it go one step, and stay there', () => {
    const levels = withHairpinLevels([{ beat: 0, level: p }], [hairpin(0, 4)], mf);
    expect(levelAt(levels, [hairpin(0, 4)], 2, mf)).toBeCloseTo(p + LEVEL_STEP / 2);
    expect(levelAt(levels, [hairpin(0, 4)], 6, mf)).toBeCloseTo(p + LEVEL_STEP);
  });

  it('does not head for a mark that goes the other way', () => {
    // A diminuendo from f followed by ff: it still goes a step softer.
    const levels = withHairpinLevels(
      [
        { beat: 0, level: f },
        { beat: 4, level: MARK_LEVELS.ff },
      ],
      [hairpin(0, 3, 'diminuendo')],
      mf,
    );
    expect(levelAt(levels, [hairpin(0, 3, 'diminuendo')], 3, mf)).toBeCloseTo(f - LEVEL_STEP);
  });
});

describe('dynamicsAlongPage', () => {
  const mark = (beat: number, text: string, more: Partial<DynamicMark> = {}): DynamicMark => ({ beat, below: false, text, letters: /^[pmfrszn]+$/.test(text), ...more });

  it('sets the usual level of each mark, or the one the source gives it', () => {
    const { levels } = dynamicsAlongPage([mark(0, 'p'), mark(4, 'f', { level: 99 })], [], []);
    expect(levels).toEqual([
      { beat: 0, level: p },
      { beat: 4, level: 99 },
    ]);
  });

  it('stresses the notes at sfz without changing the level; fp is loud there and soft after', () => {
    const { levels, accents } = dynamicsAlongPage([mark(0, 'sfz'), mark(4, 'fp')], [], []);
    expect(accents).toEqual([
      { beat: 0, factor: 1.35, level: undefined },
      { beat: 4, factor: 1, level: f },
    ]);
    expect(levels).toEqual([{ beat: 4, level: p }]);
  });

  it('takes "cresc." and "dim." as hairpins of about a bar, and other words as nothing', () => {
    expect(dynamicWords('cresc.')).toBe('crescendo');
    expect(dynamicWords('Diminuendo')).toBe('diminuendo');
    expect(dynamicWords('dolce')).toBeNull();
    const { hairpins, levels } = dynamicsAlongPage([mark(8, 'dim.')], [], []);
    expect(hairpins).toEqual([{ start: 8, end: 12, type: 'diminuendo', below: false, drawn: false }]);
    expect(levels).toEqual([]);
  });

  it('follows a drawn hairpin rather than the words that start with it', () => {
    const { hairpins } = dynamicsAlongPage([mark(0, 'cresc.')], [], [hairpin(0, 8)]);
    expect(hairpins.map((h) => [h.end, h.drawn])).toEqual([
      [8, true],
      [4, false],
    ]);
  });

  it('keeps levels set with no mark printed', () => {
    expect(dynamicsAlongPage([], [{ beat: 2, level: 40 }], []).levels).toEqual([{ beat: 2, level: 40 }]);
  });
});
