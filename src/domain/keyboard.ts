import { isBlackKey } from './pitch';

/*
 * A keyboard as it lies: where each key stands across it. Measured in white keys, the unit a
 * keyboard is made of: whoever draws it (keys to press, tiles over them) scales that to its room.
 */

/** A black key is this wide, in white keys. */
export const BLACK_KEY_WIDTH = 0.62;

/**
 * Where a key stands on a keyboard that begins at `lowest` (a white key): its left edge and its
 * width, in white keys. A black key stands over the line between two white ones.
 */
export function keyPlace(pitch: number, lowest: number): { left: number; width: number } {
  let whitesBefore = 0;
  for (let key = lowest; key < pitch; key++) if (!isBlackKey(key)) whitesBefore++;
  return isBlackKey(pitch) ? { left: whitesBefore - BLACK_KEY_WIDTH / 2, width: BLACK_KEY_WIDTH } : { left: whitesBefore, width: 1 };
}

/** How many white keys a keyboard of `keys` keys from `lowest` has. */
export const whiteKeys = (lowest: number, keys: number): number => Array.from({ length: keys }, (_, key) => lowest + key).filter((pitch) => !isBlackKey(pitch)).length;
