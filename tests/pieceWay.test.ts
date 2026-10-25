import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Playback } from '../src/application/use-cases/Playback';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';

/* A piece listened to, or learnt: four bars of a second each, a note in each. */

const piece = (title: string) =>
  createScore(
    title,
    [0, 1, 2, 3].map((bar) => ({ pitch: 60 + bar, start: bar, duration: 1, beat: bar * 4, beats: 4, velocity: 0.8, hand: bar % 2 ? ('left' as const) : ('right' as const) })),
    [0, 1, 2, 3],
  );

function practising() {
  const playback = new Playback(new FakeAudio(), new FakeTicker());
  playback.load(piece('one'));
  const loop = new BarLoop(playback);
  const trainer = new TempoTrainer(playback);
  const way = new PieceWay(playback, loop, trainer);
  return { playback, loop, trainer, way };
}

describe('a piece listened to or learnt', () => {
  it('is learnt to begin with, as it is set', () => {
    const { way } = practising();
    expect(way.way).toBe('learn');
    expect(way.learning).toBeNull();
  });

  it('is listened to whole: both hands, at its own tempo, no loop, no trainer', () => {
    const { playback, loop, trainer, way } = practising();
    loop.select(2, 3, 1);
    playback.setHandEnabled('right', false);
    trainer.setEnabled(true);
    way.set('listen');
    expect([playback.isHandEnabled('right'), playback.tempo, loop.enabled, trainer.enabled]).toEqual([true, 1, false, false]);
  });

  it('comes back to learning as it was left: the loop, the hands, the tempo, the trainer', () => {
    const { playback, loop, trainer, way } = practising();
    loop.select(2, 3, 1);
    playback.setHandEnabled('right', false);
    trainer.setPlan({ from: 0.7, back: true });
    trainer.setEnabled(true);
    playback.setTempo(0.74);
    way.set('listen');
    playback.setTempo(0.9);
    way.set('learn');
    expect([loop.enabled, loop.from, loop.to, playback.isHandEnabled('right'), playback.tempo, trainer.enabled, trainer.plan.back]).toEqual([true, 2, 3, false, 0.74, true, true]);
    expect(way.learning).toBeNull();
  });

  it('learns another piece from the start, letting go of what was kept for the last', () => {
    const { playback, way } = practising();
    way.set('listen');
    playback.load(piece('two'));
    expect(way.way).toBe('learn');
    expect(way.learning).toBeNull();
  });
});
