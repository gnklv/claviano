import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

/* The tempo trainer: a loop of one bar of two seconds (at the piece's own tempo), played on and on. */

const score = createScore(
  'test',
  [0, 1, 2, 3].map((start) => ({ pitch: 60 + start, start, duration: 0.5, beat: start, beats: 0.5, velocity: 0.8, hand: 'right' as const })),
  [0, 2],
);

async function training(plan: Parameters<TempoTrainer['setPlan']>[0]) {
  const audio = new FakeAudio();
  const ticker = new FakeTicker();
  const playback = new Playback(audio, ticker);
  playback.load(score);
  playback.setLoop({ start: 0, end: 2 });
  const trainer = new TempoTrainer(playback);
  trainer.setPlan(plan);
  trainer.setEnabled(true);
  await playback.play();
  /** The tempo of each pass, played one after another until `passes` of them have begun. */
  const tempos = async (passes: number) => {
    const heard = [playback.tempo];
    while (heard.length < passes) {
      const round = playback.loopRounds;
      while (playback.loopRounds === round) {
        audio.time += 0.025;
        ticker.tick();
      }
      await Promise.resolve();
      heard.push(playback.tempo);
    }
    return heard;
  };
  return { playback, trainer, tempos };
}

describe('the tempo trainer', () => {
  it('begins at its first tempo, and plays each pass a step quicker', async () => {
    const { tempos } = await training({ from: 0.6, to: 1, step: 0.02, every: 1 });
    expect(await tempos(5)).toEqual([0.6, 0.62, 0.64, 0.66, 0.68]);
  });

  it('takes a step after as many passes as it is told', async () => {
    const { tempos } = await training({ from: 0.7, to: 1, step: 0.05, every: 2 });
    expect(await tempos(6)).toEqual([0.7, 0.7, 0.75, 0.75, 0.8, 0.8]);
  });

  it('stops at the tempo aimed at, and the loop goes on at it', async () => {
    const { tempos, trainer } = await training({ from: 0.9, to: 1, step: 0.05, every: 1 });
    expect(await tempos(5)).toEqual([0.9, 0.95, 1, 1, 1]);
    expect(trainer.reached).toBe(true);
  });

  it('goes two steps up and one back, in turn, when told to, and stops at the tempo aimed at', async () => {
    const { tempos } = await training({ from: 0.6, to: 0.7, step: 0.02, every: 1, back: true });
    expect(await tempos(9)).toEqual([0.6, 0.64, 0.62, 0.66, 0.64, 0.68, 0.66, 0.7, 0.7]);
  });

  it('begins its two up and one back again from a tempo set by hand', async () => {
    const { playback, tempos } = await training({ from: 0.6, to: 1, step: 0.02, every: 1, back: true });
    await tempos(3);
    playback.setTempo(0.8);
    // (From the tempo set: two up first, as at the start.)
    const after = await tempos(3);
    expect(after).toEqual([0.8, 0.84, 0.82]);
  });

  it('goes on from a tempo set by hand', async () => {
    const { playback, tempos } = await training({ from: 0.6, to: 1, step: 0.02, every: 1 });
    await tempos(2);
    playback.setTempo(0.8);
    expect(await tempos(3)).toEqual([0.8, 0.82, 0.84]);
  });

  it('leaves the tempo where it has come to when it is switched off', async () => {
    const { playback, trainer, tempos } = await training({ from: 0.6, to: 1, step: 0.02, every: 1 });
    await tempos(3);
    trainer.setEnabled(false);
    expect(await tempos(3)).toEqual([0.64, 0.64, 0.64]);
    expect(playback.tempo).toBe(0.64);
  });
});
