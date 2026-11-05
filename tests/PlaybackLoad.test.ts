import { expect, it, vi } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

it.each([false, true])('offers the outgoing score and settings before loading (playing: %s)', async (playing) => {
  const audio = new FakeAudio();
  const playback = new Playback(audio, new FakeTicker());
  const score = createScore('First', [{ pitch: 60, start: 0, duration: 8, beat: 0, beats: 8, velocity: 0.8, hand: 'right' }], [0]);
  playback.load(score);
  playback.setTempo(0.5);
  playback.setHandEnabled('left', false);
  playback.seek(2);
  if (playing) { await playback.play(); audio.time += 1; }
  const before = vi.fn(() => {
    expect(playback.score).toBe(score);
    expect(playback.playing).toBe(playing);
    expect(playback.tempo).toBe(0.5);
    expect(playback.isHandEnabled('left')).toBe(false);
    expect(playback.position).toBe(playing ? 2.5 : 2);
  });
  const stop = playback.onBeforeLoad(before);
  playback.load(createScore('Second', [], []));
  expect(before).toHaveBeenCalledOnce();
  stop();
  playback.load(score);
  expect(before).toHaveBeenCalledOnce();
});
