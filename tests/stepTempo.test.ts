import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { PRACTICE_TEMPO, stepTempo } from '../src/application/use-cases/stepTempo';
import { FakeAudio, FakeTicker } from './fakes';

describe('stepTempo', () => {
  const playback = () => new Playback(new FakeAudio(), new FakeTicker());

  it('makes the tempo a step slower or faster, in exact hundredths', () => {
    const player = playback();
    for (let step = 1; step <= 15; step++) {
      stepTempo(player, -1);
      expect(player.tempo).toBe((100 - step * 5) / 100);
    }
    stepTempo(player, 3);
    expect(player.tempo).toBe(0.4);
  });

  it('goes from a tempo between two steps to the nearest step that way', () => {
    const player = playback();
    player.setTempo(0.72);
    stepTempo(player, 1);
    expect(player.tempo).toBe(0.75);
    player.setTempo(0.72);
    stepTempo(player, -1);
    expect(player.tempo).toBe(0.7);
  });

  it('stays within the tempos offered', () => {
    const player = playback();
    stepTempo(player, 100);
    expect(player.tempo).toBe(PRACTICE_TEMPO.max);
    stepTempo(player, -100);
    expect(player.tempo).toBe(PRACTICE_TEMPO.min);
  });
});
