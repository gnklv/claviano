import { describe, expect, it } from 'vitest';
import { TapeMotion, type MusicHere } from '../src/infrastructure/render/staff/tapeMotion';

/* Where the staff's tape stands, frame by frame: bars of 100 px and of one second each, the cursor at 0. */

const FRAME = 1 / 60;
/** The music at `position` seconds, in bar `bar` as printed (by default the bar it is played in). */
const at = (position: number, bar = Math.floor(position), overRoom = false): MusicHere => ({
  position,
  target: -(bar * 100 + (position % 1) * 100),
  bar,
  overRoom: () => overRoom,
});

describe('the tape', () => {
  it('follows the music exactly while it plays on from bar to bar', () => {
    const motion = new TapeMotion();
    for (let position = 0; position < 3; position += FRAME) expect(motion.frame(at(position), FRAME, true)).toBeCloseTo(at(position).target, 6);
  });

  it('glides back to the start of a repeat, and to bars past the room kept for a key or time sign', () => {
    for (const leap of [at(4.02, 0), at(4.02, 4, true)]) {
      const motion = new TapeMotion();
      for (let position = 3; position < 4; position += FRAME) motion.frame(at(position), FRAME, true);
      const before = motion.frame(at(3.999), FRAME, true);
      const first = motion.frame(leap, FRAME, true);
      expect(first).not.toBeCloseTo(leap.target, 0);
      expect(Math.abs(first - leap.target)).toBeLessThan(Math.abs(before - leap.target));
      let shown = first;
      for (let i = 0; i < 60; i++) shown = motion.frame({ ...leap, position: leap.position + i * FRAME, target: leap.target - i * FRAME * 100 }, FRAME, true);
      expect(shown).toBeCloseTo(leap.target - 59 * FRAME * 100, 0);
    }
  });

  it('stays where it is dragged, within its bounds, while the music stands still', () => {
    const motion = new TapeMotion();
    motion.frame(at(1), FRAME, false);
    expect(motion.dragBy(-50, -300, 0)).toBe(-50);
    expect(motion.dragBy(-500, -300, 0)).toBe(-150);
    for (let i = 0; i < 600; i++) expect(motion.frame(at(1), FRAME, false)).toBe(-300);
    expect(motion.held).toBe(-300);
  });
});
