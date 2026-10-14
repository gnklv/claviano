import { describe, expect, it } from 'vitest';
import { AHEAD, handAhead } from '../src/application/use-cases/handAhead';
import { FakeAudio, FakeTicker } from './fakes';

/* Sound handed to the output ahead of its clock: the one way, for the music and for a take's metronome. */

describe('handing sound ahead', () => {
  it('asks for what is due up to a little past the output’s clock, at once and at every tick', () => {
    const audio = new FakeAudio();
    const ticker = new FakeTicker();
    const asked: number[] = [];
    handAhead(ticker, audio, (until) => asked.push(until));
    expect(asked).toEqual([AHEAD]);
    audio.time = 1;
    ticker.tick();
    expect(asked).toEqual([AHEAD, 1 + AHEAD]);
  });

  it('asks no more once stopped', () => {
    const audio = new FakeAudio();
    const ticker = new FakeTicker();
    const asked: number[] = [];
    const stop = handAhead(ticker, audio, (until) => asked.push(until));
    stop();
    ticker.tick();
    expect(asked).toHaveLength(1);
  });
});
