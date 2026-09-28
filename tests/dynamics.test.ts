import { describe, expect, it } from 'vitest';
import { LEVEL_STEP, levelAt, MARK_LEVELS, withHairpinLevels, type Hairpin } from '../src/domain/notation/dynamics';

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
