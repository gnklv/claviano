import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { Bookmarks } from '../src/application/use-cases/Bookmarks';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

/* Bookmarks in a piece of eight bars of one second each, numbered 1 to 8. */

const piece = (title: string) =>
  createScore(
    title,
    Array.from({ length: 8 }, (_, bar) => ({ pitch: 60 + bar, start: bar, duration: 1, beat: bar * 4, beats: 4, velocity: 0.8, hand: 'right' as const })),
    Array.from({ length: 8 }, (_, bar) => bar),
  );

function practising() {
  const audio = new FakeAudio();
  const playback = new Playback(audio, new FakeTicker());
  playback.load(piece('one'));
  const loop = new BarLoop(playback);
  const bookmarks = new Bookmarks(playback, loop);
  return { audio, playback, loop, bookmarks };
}

describe('bookmarks', () => {
  it('are kept in the order of their bars, renamed and taken away', () => {
    const { bookmarks } = practising();
    bookmarks.add('The end', 7);
    bookmarks.add('The theme', 2);
    bookmarks.add('  ', 5);
    expect(bookmarks.all).toEqual([
      { name: 'The theme', bar: 2 },
      { name: '5', bar: 5 },
      { name: 'The end', bar: 7 },
    ]);
    bookmarks.rename(1, ' The hard bars ');
    bookmarks.rename(0, '   ');
    bookmarks.remove(2);
    expect(bookmarks.all).toEqual([
      { name: 'The theme', bar: 2 },
      { name: 'The hard bars', bar: 5 },
    ]);
  });

  it('go to their bar, and playing goes on from there', async () => {
    const { audio, playback, bookmarks } = practising();
    bookmarks.add('The hard bars', 5);
    await playback.play();
    bookmarks.goTo(0);
    expect(playback.position).toBe(4);
    expect(playback.playing).toBe(true);
    audio.time += 0.5;
    expect(playback.position).toBeCloseTo(4.5);
  });

  it('let the loop go when they are out of it, and keep it when they are in it', () => {
    const { playback, loop, bookmarks } = practising();
    bookmarks.add('In', 2);
    bookmarks.add('Out', 7);
    loop.select(1, 3, 0);
    bookmarks.goTo(0);
    expect([loop.enabled, playback.position]).toEqual([true, 1]);
    bookmarks.goTo(1);
    expect([loop.enabled, playback.position]).toEqual([false, 6]);
  });

  it('are not carried over to another piece', () => {
    const { playback, bookmarks } = practising();
    bookmarks.add('The theme', 2);
    playback.load(piece('two'));
    expect(bookmarks.all).toEqual([]);
  });
});
