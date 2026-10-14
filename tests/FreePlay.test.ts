import { beforeEach, describe, expect, it } from 'vitest';
import { FreePlay } from '../src/application/use-cases/FreePlay';
import { FakeAudio } from './fakes';

/* Playing by hand: keys held and let go, on a stretch of the piano that moves by octaves. */

let audio: FakeAudio;
let play: FreePlay;
const held = () => audio.struck.filter((struck) => struck.released === null).map((struck) => struck.pitch);

beforeEach(() => {
  audio = new FakeAudio();
  play = new FreePlay(audio);
});

describe('free play', () => {
  it('sounds a key from when it goes down until it comes up', () => {
    play.press(60);
    audio.time = 1.5;
    expect(held()).toEqual([60]);
    expect([...play.pressed]).toEqual([60]);
    play.release(60);
    expect(audio.struck).toEqual([{ pitch: 60, velocity: 0.75, at: 0, released: 1.5 }]);
    expect([...play.pressed]).toEqual([]);
  });

  it('holds several keys at once, each let go by itself', () => {
    play.press(60);
    play.press(64);
    play.press(67);
    play.release(64);
    expect(held()).toEqual([60, 67]);
  });

  it('strikes a key once however many times it is pressed while down, and ignores a key let go that was not down', () => {
    play.press(60);
    play.press(60);
    play.release(62);
    expect(audio.struck).toHaveLength(1);
    play.release(60);
    play.press(60);
    expect(audio.struck).toHaveLength(2);
  });

  it('plays nothing off the piano', () => {
    play.press(20);
    play.press(109);
    expect(audio.struck).toEqual([]);
    play.press(21);
    play.press(108);
    expect(held()).toEqual([21, 108]);
  });

  it('lets every key go at once', () => {
    play.press(60);
    play.press(64);
    play.releaseAll();
    expect(held()).toEqual([]);
    expect([...play.pressed]).toEqual([]);
  });

  it('shows two octaves and a key from the Do below middle Do, to begin with', () => {
    expect([play.lowest, play.keys]).toEqual([48, 25]);
  });

  it('moves by octaves, letting go of what is held, and no further than the piano goes', () => {
    play.press(60);
    play.shift(1);
    expect(play.lowest).toBe(60);
    expect(held()).toEqual([]);

    for (let i = 0; i < 10; i++) play.shift(1);
    expect(play.lowest + play.keys - 1).toBeLessThanOrEqual(108);
    expect(play.canGoHigher).toBe(false);
    for (let i = 0; i < 10; i++) play.shift(-1);
    expect(play.lowest).toBe(24);
    expect(play.canGoLower).toBe(false);
  });

  it('is as wide as it is told there is room for, and stays on the piano when it widens', () => {
    for (let i = 0; i < 10; i++) play.shift(1);
    play.setKeys(37);
    expect(play.keys).toBe(37);
    expect(play.lowest + 36).toBeLessThanOrEqual(108);
    expect(play.lowest % 12).toBe(0);
  });

  it('is entered and left, and every key held comes up as it is left', () => {
    expect(play.entered).toBe(false);
    play.enter();
    expect(play.entered).toBe(true);
    play.press(60);
    play.leave();
    expect(play.entered).toBe(false);
    expect(held()).toEqual([]);
  });

  it('tells its listeners of keys and of the keyboard moving, until they leave', () => {
    let changes = 0;
    const stop = play.onChange(() => changes++);
    play.press(60);
    play.release(60);
    play.shift(1);
    play.setKeys(13);
    expect(changes).toBe(4);
    stop();
    play.press(60);
    expect(changes).toBe(4);
  });
});
