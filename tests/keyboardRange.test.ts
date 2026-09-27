import { describe, expect, it } from 'vitest';
import type { Note } from '../src/domain/note';
import { pitch } from '../src/domain/pitch';
import { createScore } from '../src/domain/score';
import { keyboardRange, whiteKeyCount } from '../src/infrastructure/render/keyboardRange';

const scoreWith = (...pitches: number[]) =>
  createScore(
    'test',
    pitches.map((p, i): Note => ({ pitch: p, start: i, duration: 1, beat: i, beats: 1, velocity: 1, hand: 'right' })),
    [0],
  );

const PHONE = 375;
const FULL = { low: 21, high: 108 };

describe('keyboardRange', () => {
  it('spans the piece from the Do below its lowest note to the Do above its highest', () => {
    // Ode to Joy demo: Sol2..Sol4 → Do2..Do5 (До б .. До2 in Russian naming)
    expect(keyboardRange(scoreWith(pitch('Sol', 2), pitch('Sol', 4)), PHONE)).toEqual({
      low: pitch('Do', 2),
      high: pitch('Do', 5),
    });
  });

  it('does not add an octave when the highest note is already a Do', () => {
    expect(keyboardRange(scoreWith(pitch('Do', 3), pitch('Do', 5)), PHONE)).toEqual({
      low: pitch('Do', 3),
      high: pitch('Do', 5),
    });
  });

  it('shows at least two octaves', () => {
    expect(keyboardRange(scoreWith(pitch('Mi', 4)), PHONE)).toEqual({
      low: pitch('Do', 3),
      high: pitch('Do', 5),
    });
  });

  it('shows more octaves on wide screens so keys do not get too wide', () => {
    const range = keyboardRange(scoreWith(pitch('Sol', 2), pitch('Sol', 4)), 1280);
    expect(1280 / whiteKeyCount(range)).toBeLessThanOrEqual(40);
    expect(range).toEqual({ low: pitch('Do', 1), high: pitch('Do', 6) });
  });

  it('shows more octaves when keys must stay narrow, e.g. a short keyboard in landscape', () => {
    const ode = scoreWith(pitch('Sol', 2), pitch('Sol', 4));
    const range = keyboardRange(ode, 812, 22);
    expect(812 / whiteKeyCount(range)).toBeLessThanOrEqual(22);
    expect(whiteKeyCount(range)).toBeGreaterThan(whiteKeyCount(keyboardRange(ode, 812)));
  });

  it('never goes beyond the 88 keys', () => {
    expect(keyboardRange(scoreWith(pitch('Mi', 4)), 4000)).toEqual(FULL);
    expect(keyboardRange(scoreWith(21, 108), PHONE)).toEqual(FULL);
  });

  it('shows three octaves around middle Do before a score is loaded', () => {
    expect(keyboardRange(null, PHONE)).toEqual({ low: pitch('Do', 3), high: pitch('Do', 6) });
  });
});
