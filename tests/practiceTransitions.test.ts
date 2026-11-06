import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { followPlan } from '../src/application/use-cases/followPlan';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { performNotation } from '../src/domain/notation/performance';
import { FakeAudio, FakeTicker } from './fakes';
import { notation, written } from './layerScoreFixtures';

function practising() {
  const audio = new FakeAudio();
  const ticker = new FakeTicker();
  const playback = new Playback(audio, ticker);
  playback.load(performNotation(notation([
    written(0, 72, { beats: 4 }),
    written(0, 48, { staff: 2, voice: '2', hand: 'left' }),
    written(0.5, 55, { staff: 2, voice: '2', hand: 'left' }),
  ])));
  const barLoop = new BarLoop(playback);
  const trainer = new TempoTrainer(playback);
  const way = new PieceWay(playback, barLoop, trainer);
  const plan = new PracticePlan(playback);
  followPlan(plan, { playback, barLoop, trainer, way });
  const up = plan.steps.findIndex((step) => step.kind === 'up');
  const pass = async () => {
    const started = playback.tempo;
    await playback.play();
    let ticks = 0;
    while (playback.playing && ticks++ < 2_000) {
      audio.time += 0.025;
      ticker.tick();
      await Promise.resolve();
    }
    expect(playback.playing).toBe(false);
    return { started, following: playback.tempo };
  };
  return { audio, playback, barLoop, trainer, way, plan, up, pass };
}

describe('guided tempo graduation', () => {
  it('keeps the tempo step active after three clean passes below the target tempo', async () => {
    const { plan, up, pass } = practising();
    plan.start(up);
    const passes = [];
    for (let i = 0; i < 3; i++) {
      passes.push(await pass());
      plan.clean();
    }
    expect(passes).toEqual([
      { started: 0.6, following: 0.6 },
      { started: 0.7, following: 0.7 },
      { started: 0.8, following: 0.8 },
    ]);
    expect(plan.progress(up)).toEqual({ clean: 0, done: false });
    expect(plan.current).toBe(up);
  });

  it('does not count the pass that first brings the next tempo to the target', async () => {
    const { playback, plan, up, pass } = practising();
    plan.start(up);
    playback.setTempo(0.9);
    expect(await pass()).toEqual({ started: 0.9, following: 0.9 });
    expect(playback.tempo).toBe(0.9);
    plan.clean();
    expect(plan.progress(up)).toEqual({ clean: 0, done: false });
    for (let count = 1; count <= 2; count++) {
      expect(await pass()).toEqual({ started: 1, following: 1 });
      plan.clean();
      expect(plan.progress(up)).toEqual({ clean: count, done: false });
    }
    await pass();
    plan.clean();
    expect(plan.progress(up).done).toBe(true);
  });

  it('raises tempo on clean physical-piano passes and completes only after three at the target', () => {
    const { playback, plan, up } = practising();
    plan.start(up);
    for (const tempo of [0.7, 0.8, 0.9, 1]) {
      plan.clean();
      expect(playback.tempo).toBe(tempo);
      expect(plan.progress(up)).toEqual({ clean: 0, done: false });
    }
    plan.clean();
    plan.clean();
    expect(plan.progress(up)).toEqual({ clean: 2, done: false });
    plan.clean();
    expect(plan.progress(up).done).toBe(true);
  });

  it('retries slower after a slip, including before any clean pass is counted', async () => {
    const { playback, plan, up, pass } = practising();
    plan.start(up);
    plan.clean();
    expect(playback.tempo).toBe(0.7);
    await pass();
    plan.missed();
    expect(playback.tempo).toBe(0.6);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBe(playback.loop!.start);
    plan.missed();
    expect(playback.tempo).toBe(0.6);
    playback.setTempo(0.4);
    plan.missed();
    expect(playback.tempo).toBe(0.4);
    playback.setTempo(1);
    plan.clean();
    plan.missed();
    expect(playback.tempo).toBe(0.9);
    expect(plan.progress(up)).toEqual({ clean: 0, done: false });
  });

  it('keeps resumed tempo work assessment-driven even with older saved automatic training', async () => {
    const { playback, plan, up, trainer, way, pass } = practising();
    plan.start(up);
    playback.setTempo(0.8);
    trainer.restore({ on: true, plan: { from: 0.6, to: 1, step: 0.1, every: 1, back: true } });
    const savedTempo = playback.tempo;
    way.set('listen');
    plan.set(plan.steps.flatMap((_, index) => index < up ? [index] : []));
    way.set('learn');
    expect(playback.tempo).toBe(savedTempo);
    expect(plan.current).toBe(up);
    expect(playback.tempo).toBe(0.8);
    expect(trainer.enabled).toBe(false);
    expect(await pass()).toEqual({ started: 0.8, following: 0.8 });
    plan.clean();
    expect(playback.tempo).toBe(0.9);
  });

  it('accepts clean physical-piano assessments at the target without requiring playback', () => {
    const { playback, plan, up } = practising();
    plan.start(up);
    playback.setTempo(1);
    plan.clean();
    plan.clean();
    plan.clean();
    expect(plan.progress(up).done).toBe(true);
  });

  it('resets the target-tempo streak when the learner practises below the target again', () => {
    const { playback, plan, up } = practising();
    plan.start(up);
    playback.setTempo(1);
    plan.clean();
    expect(plan.progress(up).clean).toBe(1);
    playback.setTempo(0.8);
    plan.clean();
    expect(plan.progress(up)).toEqual({ clean: 0, done: false });
  });

  it('clears an old completed tempo when the learner explicitly sets the target', async () => {
    const { playback, plan, up, pass } = practising();
    plan.start(up);
    playback.setTempo(0.9);
    await pass();
    expect(playback.lastCompletedPassTempo).toBe(0.9);
    playback.setTempo(1);
    expect(playback.lastCompletedPassTempo).toBeNull();
    plan.clean();
    plan.clean();
    plan.clean();
    expect(plan.progress(up).done).toBe(true);
  });

  it.each(['seek', 'stop', 'play', 'task', 'selection'] as const)('forgets a completed tempo when %s starts different practice', async (change) => {
    const { playback, plan, up, pass } = practising();
    plan.start(up);
    playback.setTempo(0.9);
    await pass();
    expect(playback.lastCompletedPassTempo).toBe(0.9);
    if (change === 'seek') playback.seek(playback.position);
    if (change === 'stop') playback.stop();
    if (change === 'play') {
      await playback.play();
      playback.pause();
    }
    if (change === 'task') plan.start(up);
    if (change === 'selection') playback.setNoteSelection([0]);
    expect(playback.lastCompletedPassTempo).toBeNull();
  });
});

describe('starting guided work again', () => {
  it('reselects the current step paused at its beginning with fresh defaults and no clean streak', async () => {
    const { playback, audio, plan } = practising();
    plan.start(0);
    await playback.play();
    audio.time += 0.25;
    playback.setTempo(0.77);
    playback.setHandEnabled('left', false);
    plan.clean();
    plan.start(0);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBe(playback.loop!.start);
    expect(playback.tempo).toBe(0.6);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
    expect(plan.progress(0)).toEqual({ clean: 0, done: false });
  });

  it('restarts the whole plan at its first step, paused, with its defaults restored', async () => {
    const { playback, audio, plan, up } = practising();
    plan.set([0, 1]);
    plan.start(up);
    await playback.play();
    audio.time += 0.25;
    playback.setTempo(0.77);
    plan.restart();
    expect(plan.current).toBe(0);
    expect(plan.doneSteps).toEqual([]);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBe(playback.loop!.start);
    expect(playback.tempo).toBe(0.6);
    expect(playback.noteSelection).not.toBeNull();
  });
});
