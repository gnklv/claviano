// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { followPlan } from '../src/application/use-cases/followPlan';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { partsOf } from '../src/domain/practice/parts';
import { AT_TEMPO, planOf, SLOW, UP_BY } from '../src/domain/practice/plan';
import type { Hand, Note } from '../src/domain/note';
import { transcribed } from '../src/domain/notation/transcription';
import { createScore, writtenBarNumber } from '../src/domain/score';
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
  it('sets each hand slow, alone and then to the other heard; both slow, up to tempo, then joins the part to the one before', () => {
    const steps = planOf(ode()).map((step) => `${step.kind} ${step.from}–${step.to} ${step.hands} ${step.tempo}${step.aim ? `→${step.aim}` : ''}`);
    expect(steps).toEqual([
      `alone 0–3 right ${SLOW}`,
      `with 0–3 right ${SLOW}`,
      `alone 0–3 left ${SLOW}`,
      `with 0–3 left ${SLOW}`,
      `together 0–3 both ${SLOW}`,
      `up 0–3 both ${SLOW}→${AT_TEMPO}`,
      `alone 4–7 right ${SLOW}`,
      `with 4–7 right ${SLOW}`,
      `alone 4–7 left ${SLOW}`,
      `with 4–7 left ${SLOW}`,
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

describe('what is written out again', () => {
  /** A piece of whole notes in 4/4 at 60, a bar a note: its tune's pitches and its bass's, bar by bar. */
  const written = (tune: number[], bass: number[]) => {
    const line = (pitches: number[], hand: Hand): Note[] => pitches.map((pitch, bar) => ({ pitch, start: bar * 4, duration: 4, beat: bar * 4, beats: 4, velocity: 0.6, hand }));
    const barBeats = tune.map((_, bar) => bar * 4);
    return transcribed(createScore('Again', [...line(tune, 'right'), ...line(bass, 'left')], barBeats, { barBeats, timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }], keySignatures: [{ beat: 0, fifths: 0, minor: false }] }));
  };
  const kinds = (score: ReturnType<typeof written>) => planOf(score).map((step) => `${step.kind} ${step.from + 1}–${step.to + 1}${step.kind === 'alone' || step.kind === 'with' ? ` ${step.hands}` : ''}`);

  it('learns a part written out again once, and plays the way into it', () => {
    const tune = [64, 65, 67, 65], bass = [48, 43, 48, 43];
    expect(kinds(written([...tune, ...tune, 60, 62, 64, 60], [...bass, ...bass, ...bass]))).toEqual([
      'alone 1–4 right', 'with 1–4 right', 'alone 1–4 left', 'with 1–4 left', 'together 1–4', 'up 1–4',
      // (Bars 5–8 are bars 1–4 again: only the way from the one into the other.)
      'join 1–8',
      'alone 9–12 right', 'with 9–12 right', 'with 9–12 left', 'together 9–12', 'up 9–12', 'join 5–12',
      'whole 1–12',
    ]);
  });

  it('learns a hand alone once for a line it plays again under another tune', () => {
    expect(kinds(written([64, 65, 67, 65, 60, 62, 64, 60], [48, 43, 48, 43, 48, 43, 48, 43]))).toEqual([
      'alone 1–4 right', 'with 1–4 right', 'alone 1–4 left', 'with 1–4 left', 'together 1–4', 'up 1–4',
      // (The left hand plays its line again: to the new tune, not by itself.)
      'alone 5–8 right', 'with 5–8 right', 'with 5–8 left', 'together 5–8', 'up 5–8', 'join 1–8',
    ]);
  });

  it('plays a join that comes again once', () => {
    const a = [64, 65, 67, 65], b = [60, 62, 64, 60], bass = [48, 43, 48, 43];
    const steps = kinds(written([...a, ...b, ...a, ...b], [...bass, ...bass, ...bass, ...bass]));
    expect(steps.filter((step) => step.startsWith('join'))).toEqual(['join 1–8', 'join 5–12']);
    expect(steps.at(-1)).toBe('whole 1–16');
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

  it('sets what a step is played with: its bars looped a pass at a time, the metronome, its tempo, the piece learnt; the hand played not heard', () => {
    const { playback, barLoop, trainer, way, plan } = practising();
    way.set('listen');
    // A hand alone, slow: the left hand of bars 5–8, to the metronome alone.
    plan.start(plan.steps.findIndex((step) => step.kind === 'alone' && step.hands === 'left' && step.from === 4));
    expect(way.way).toBe('learn');
    expect([barLoop.enabled, barLoop.from, barLoop.to, playback.passAtATime]).toEqual([true, 5, 8, true]);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left'), playback.metronomeEnabled]).toEqual([false, false, true]);
    expect(playback.tempo).toBe(SLOW);
    expect(trainer.enabled).toBe(false);
    // The same hand to the other: the right hand heard.
    plan.start(plan.steps.findIndex((step) => step.kind === 'with' && step.hands === 'left' && step.from === 4));
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, false]);
    // Out of the plan, the music is as it was: the loop going round, both hands heard, no metronome.
    plan.stop();
    expect([playback.passAtATime, playback.isHandEnabled('right'), playback.isHandEnabled('left'), playback.metronomeEnabled]).toEqual([false, true, true, false]);
  });

  it('brings a part up to tempo with the trainer, two steps up and one back', () => {
    const { playback, trainer, plan } = practising();
    plan.start(plan.steps.findIndex((step) => step.kind === 'up'));
    expect(trainer.enabled).toBe(true);
    expect(trainer.plan).toMatchObject({ from: SLOW, to: AT_TEMPO, step: UP_BY, every: 1, back: true });
    expect(playback.tempo).toBe(SLOW);
  });

  it('leaves a step when the loop is changed by hand, not when a hand is let be heard', () => {
    const { playback, barLoop, plan } = practising();
    plan.start(0);
    playback.seek(1);
    playback.setHandEnabled('right', true);
    expect(plan.current).toBe(0);
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
