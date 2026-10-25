// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { followPlan } from '../src/application/use-cases/followPlan';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { partsOf } from '../src/domain/practice/parts';
import { AT_TEMPO, planOf, SLOW } from '../src/domain/practice/plan';
import { writtenBarNumber } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';
import { ode, showcase } from './staffPieces';

/* A piece in parts, the steps for learning it, and a step followed: what it sets, and when it is done. */

const bars = (score: ReturnType<typeof ode>) => partsOf(score).map((part) => `${writtenBarNumber(score, part.from)}–${writtenBarNumber(score, part.to)}`);

describe('a piece in parts', () => {
  it('cuts a piece of eight bars into two phrases of four', () => {
    expect(bars(ode())).toEqual(['1–4', '5–8']);
  });

  it('cuts by the form first, a pickup with the first part, a bar or two of a section with the one before', () => {
    expect(bars(showcase())).toEqual(['0–4', '5–9', '10–12', '13–16', '17–20', '21–24', '25–28', '29–32']);
  });
});

describe('the steps for learning it', () => {
  it('sets each hand alone and slow, both slow, up to tempo, then joins the part to the one before', () => {
    const steps = planOf(ode()).map((step) => `${step.kind} ${step.from}–${step.to} ${step.hands} ${step.tempo}${step.aim ? `→${step.aim}` : ''}`);
    expect(steps).toEqual([
      `alone 0–3 right ${SLOW}`,
      `alone 0–3 left ${SLOW}`,
      `together 0–3 both ${SLOW}`,
      `up 0–3 both ${SLOW}→${AT_TEMPO}`,
      `alone 4–7 right ${SLOW}`,
      `alone 4–7 left ${SLOW}`,
      `together 4–7 both ${SLOW}`,
      `up 4–7 both ${SLOW}→${AT_TEMPO}`,
      // (Two parts joined are the whole piece: no step of the whole after it.)
      `join 0–7 both ${AT_TEMPO}`,
    ]);
  });

  it('ends with the whole piece where the last join is not it', () => {
    const steps = planOf(showcase());
    expect(steps.at(-1)).toMatchObject({ kind: 'whole', from: 0, to: 32, tempo: AT_TEMPO });
  });
});

describe('following the plan', () => {
  function practising() {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    playback.load(ode());
    const barLoop = new BarLoop(playback);
    const trainer = new TempoTrainer(playback);
    const way = new PieceWay(playback, barLoop, trainer);
    const plan = new PracticePlan(playback);
    followPlan(plan, { playback, barLoop, trainer, way });
    return { playback, barLoop, trainer, way, plan };
  }

  it('is done with a step after three clean passes running; a slip starts the count again', () => {
    const { plan } = practising();
    plan.start(0);
    plan.clean();
    plan.clean();
    plan.missed();
    expect(plan.progress(0)).toEqual({ clean: 0, done: false });
    plan.clean();
    plan.clean();
    plan.clean();
    expect(plan.progress(0)).toEqual({ clean: 0, done: true });
    expect(plan.current).toBeNull();
    expect(plan.next).toBe(1);
  });

  it('sets what a step is played with: its bars looped, its hand, its tempo, the piece learnt', () => {
    const { playback, barLoop, trainer, way, plan } = practising();
    way.set('listen');
    // Each hand alone, slow: the left hand of bars 5–8.
    plan.start(plan.steps.findIndex((step) => step.kind === 'alone' && step.hands === 'left' && step.from === 4));
    expect(way.way).toBe('learn');
    expect([barLoop.enabled, barLoop.from, barLoop.to]).toEqual([true, 5, 8]);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([false, true]);
    expect(playback.tempo).toBe(SLOW);
    expect(trainer.enabled).toBe(false);
  });

  it('brings a part up to tempo with the trainer, two steps up and one back', () => {
    const { playback, trainer, plan } = practising();
    plan.start(plan.steps.findIndex((step) => step.kind === 'up'));
    expect(trainer.enabled).toBe(true);
    expect(trainer.plan).toMatchObject({ from: SLOW, to: AT_TEMPO, back: true });
    expect(playback.tempo).toBe(SLOW);
  });

  it('leaves a step when the loop or a hand is changed by hand', () => {
    const { playback, barLoop, plan } = practising();
    plan.start(0);
    playback.seek(1);
    expect(plan.current).toBe(0);
    playback.setHandEnabled('left', true);
    expect(plan.current).toBeNull();
    plan.start(0);
    barLoop.setTo(2);
    expect(plan.current).toBeNull();
  });

  it('keeps the steps done, and lets go of places it has no step at', () => {
    const { plan } = practising();
    plan.set([0, 2, 99, -1]);
    expect(plan.doneSteps).toEqual([0, 2]);
    plan.restart();
    expect(plan.doneSteps).toEqual([]);
  });
});
