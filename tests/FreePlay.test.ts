import { beforeEach, describe, expect, it } from 'vitest';
import type { Instrument, NoteToPrepare } from '../src/application/ports/Instrument';
import { FreePlay } from '../src/application/use-cases/FreePlay';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

/* Playing by hand: keys held and let go, on a stretch of the piano that moves by octaves. */

let audio: FakeAudio;
let playback: Playback;
let play: FreePlay;
/** What the instrument was last told to be ready for. */
let prepared: readonly NoteToPrepare[];
const instrument: Instrument = { enabled: true, status: 'ready', setEnabled() {}, onChange: () => () => {}, prepare: (notes) => (prepared = notes) };
const held = () => audio.struck.filter((struck) => struck.released === null).map((struck) => struck.pitch);

beforeEach(() => {
  audio = new FakeAudio();
  playback = new Playback(audio, new FakeTicker());
  prepared = [];
  play = new FreePlay(audio, instrument, playback);
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

  it('keeps the instrument ready for the keys shown, while it is played', () => {
    play.setKeys(13);
    expect(prepared).toEqual([]);
    play.enter();
    expect(prepared.map((note) => note.pitch)).toEqual(Array.from({ length: 13 }, (_, key) => 48 + key));
    play.shift(1);
    expect(prepared[0]?.pitch).toBe(60);
    play.setKeys(25);
    expect(prepared).toHaveLength(25);
  });

  it('gives the instrument back to the piece that is open, when it is left', () => {
    playback.load(createScore('Piece', [{ pitch: 72, start: 0, duration: 1, beat: 0, beats: 1, velocity: 0.8, hand: 'right' }], [0]));
    play.enter();
    play.press(60);
    play.leave();
    expect(held()).toEqual([]);
    expect(prepared.map((note) => note.pitch)).toEqual([72]);
    // Not played any more: the keyboard moving readies nothing.
    play.shift(1);
    expect(prepared.map((note) => note.pitch)).toEqual([72]);
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
