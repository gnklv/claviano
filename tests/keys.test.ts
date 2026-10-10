import { describe, expect, it } from 'vitest';
import { keyReleases, keyReleasesOf } from '../src/domain/keys';
import type { Hand, Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';

/* When a key is seen to come up: a finger leaves it a moment before striking it again. */

const note = (pitch: number, start: number, duration: number, hand: Hand = 'right'): Note => ({ pitch, start, duration, beat: start, beats: duration, velocity: 0.8, hand });

describe('keyReleases', () => {
  it('lets a key come up at the end of its note when nothing follows on it', () => {
    expect(keyReleases([note(60, 0, 1), note(62, 1, 1), note(64, 2, 0.5)])).toEqual([1, 2, 2.5]);
  });

  it('lifts the finger a moment before the same key is struck again', () => {
    const [first, second, third] = keyReleases([note(60, 0, 1), note(60, 1, 1), note(60, 2, 1)]);
    // Each of the first two reaches the next strike as written: shown, it ends a little before.
    expect(first).toBeLessThan(1);
    expect(first).toBeGreaterThan(0.9);
    expect(second).toBeLessThan(2);
    expect(second).toBeGreaterThan(1.9);
    expect(third).toBe(3);
  });

  it('leaves a note alone that ends well before the next strike anyway', () => {
    expect(keyReleases([note(60, 0, 0.5), note(60, 1, 0.5)])).toEqual([0.5, 1.5]);
  });

  it('takes no more than a share of a fast repeat: the notes keep most of their length', () => {
    const releases = keyReleases([note(60, 0, 0.1), note(60, 0.1, 0.1), note(60, 0.2, 0.1)]);
    expect(releases[0]).toBeCloseTo(0.07);
    expect(releases[1]).toBeCloseTo(0.17);
  });

  it('lifts a finger from a note written longer than the time to its repeat', () => {
    // A held note with the same key struck again inside it (a tremolo, an ornament written out).
    const [long] = keyReleases([note(60, 0, 4), note(60, 1, 0.5)]);
    expect(long).toBeLessThan(1);
    expect(long).toBeGreaterThan(0.9);
  });

  it('minds only the same key, whichever hand strikes it', () => {
    const releases = keyReleases([note(60, 0, 1, 'left'), note(61, 0.5, 1), note(60, 1, 1, 'right')]);
    expect(releases[0]).toBeLessThan(1);
    expect(releases[1]).toBe(1.5);
  });

  it('takes two notes on one key struck together for one strike', () => {
    const releases = keyReleases([note(60, 0, 1, 'left'), note(60, 0, 1, 'right'), note(60, 1, 1)]);
    expect(releases[0]).toBe(releases[1]);
    expect(releases[0]).toBeLessThan(1);
    expect(releases[2]).toBe(2);
  });

  it('is worked out once for a score', () => {
    const score = createScore('repeats', [note(60, 0, 1), note(60, 1, 1)], [0]);
    expect(keyReleasesOf(score)).toBe(keyReleasesOf(score));
    expect(keyReleasesOf(score)[0]).toBeLessThan(1);
  });
});
