import { describe, expect, it } from 'vitest';
import { BLACK_KEY_WIDTH, keyPlace, whiteKeys } from '../src/domain/keyboard';

/* Where keys stand on a keyboard, in white keys from its lowest. */

describe('a keyboard', () => {
  it('has its white keys side by side, one wide each', () => {
    expect([60, 62, 64, 65, 67].map((pitch) => keyPlace(pitch, 60))).toEqual([
      { left: 0, width: 1 },
      { left: 1, width: 1 },
      { left: 2, width: 1 },
      { left: 3, width: 1 },
      { left: 4, width: 1 },
    ]);
  });

  it('has each black key over the line between the two white ones it lies between', () => {
    const doSharp = keyPlace(61, 60);
    expect(doSharp.width).toBe(BLACK_KEY_WIDTH);
    expect(doSharp.left + doSharp.width / 2).toBe(1);
    const faSharp = keyPlace(66, 60);
    expect(faSharp.left + faSharp.width / 2).toBe(4);
  });

  it('counts from whatever key it begins at', () => {
    expect(keyPlace(72, 60).left).toBe(7);
    expect(keyPlace(53, 48).left).toBe(3);
  });

  it('has seven white keys to the octave, and one more with the Do above', () => {
    expect(whiteKeys(60, 12)).toBe(7);
    expect(whiteKeys(60, 13)).toBe(8);
    expect(whiteKeys(48, 25)).toBe(15);
    expect(whiteKeys(48, 18)).toBe(11);
  });
});
