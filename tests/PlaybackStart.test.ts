import { describe, expect, it, vi } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

const score = (pitch: number) => createScore('start', [{
  pitch, start: 0, duration: 2, beat: 0, beats: 2, velocity: 0.8, hand: 'right',
}], [0]);

function setup() {
  const audio = new FakeAudio();
  const resumes: (() => void)[] = [];
  audio.resume = () => new Promise<void>((resolve) => resumes.push(resolve));
  const ticker = new FakeTicker();
  const starts = vi.spyOn(ticker, 'start');
  const playback = new Playback(audio, ticker);
  playback.load(score(60));
  return { audio, resumes, starts, playback };
}

const cancellations = {
  pause: (playback: Playback) => playback.pause(),
  stop: (playback: Playback) => playback.stop(),
  load: (playback: Playback) => playback.load(score(72)),
};

describe('Playback while the audio is waking up', () => {
  it.each(Object.entries(cancellations))('cancels the pending start on %s', async (_, cancel) => {
    const { audio, resumes, starts, playback } = setup();
    const playing = playback.play();
    cancel(playback);
    resumes[0]();
    await playing;

    expect(playback.playing).toBe(false);
    expect(audio.played).toEqual([]);
    expect(starts).not.toHaveBeenCalled();
  });

  it.each(Object.entries(cancellations))('allows another start after %s while the cancelled start is pending', async (action, cancel) => {
    const { audio, resumes, starts, playback } = setup();
    const cancelled = playback.play();
    cancel(playback);
    const playing = playback.play();
    resumes[0]();
    await cancelled;
    expect(playback.playing).toBe(false);
    expect(audio.played).toEqual([]);

    resumes[1]();
    await playing;
    expect(playback.playing).toBe(true);
    expect(audio.played.map((note) => note.pitch)).toEqual([action === 'load' ? 72 : 60]);
    expect(starts).toHaveBeenCalledTimes(1);
  });

  it('keeps a later start when the cancelled start wakes up last', async () => {
    const { audio, resumes, starts, playback } = setup();
    const cancelled = playback.play();
    playback.pause();
    const playing = playback.play();
    resumes[1]();
    await playing;
    resumes[0]();
    await cancelled;

    expect(playback.playing).toBe(true);
    expect(audio.played.map((note) => note.pitch)).toEqual([60]);
    expect(starts).toHaveBeenCalledTimes(1);
  });

  it('starts the music and the ticker once when play is requested twice', async () => {
    const { audio, resumes, starts, playback } = setup();
    const first = playback.play();
    const second = playback.play();
    resumes[1]();
    await second;
    resumes[0]();
    await first;

    expect(audio.played.map((note) => note.pitch)).toEqual([60]);
    expect(starts).toHaveBeenCalledTimes(1);
  });
});
