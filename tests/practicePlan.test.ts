// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { followPlan } from '../src/application/use-cases/followPlan';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { partsOf } from '../src/domain/practice/parts';
import { AT_TEMPO, legacyPlanOf, PLAN_VERSION, planOf, SLOW, UP_BY } from '../src/domain/practice/plan';
import { performNotation } from '../src/domain/notation/performance';
import { notation, written as writtenNote } from './layerScoreFixtures';
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
  it('begins a mapped part with its lead, then adds bass before the full slow part', () => {
    const score = performNotation(notation([
      writtenNote(0, 72, { beats: 4 }),
      writtenNote(0, 48, { staff: 2, voice: '2', hand: 'left' }),
      writtenNote(0.5, 55, { staff: 2, voice: '2', hand: 'left' }),
    ]));
    expect(planOf(score)).toEqual([
      { kind: 'layer', layer: 'lead', from: 0, to: 0, hands: 'right', tempo: SLOW },
      { kind: 'layer', layer: 'lead-bass', from: 0, to: 0, hands: 'both', tempo: SLOW },
      { kind: 'together', from: 0, to: 0, hands: 'both', tempo: SLOW },
      { kind: 'up', from: 0, to: 0, hands: 'both', tempo: SLOW, aim: AT_TEMPO, by: UP_BY },
    ]);
    expect(legacyPlanOf(score)[0].kind).toBe('alone');
  });

  it('keeps the original plan when source metadata is incomplete', () => {
    const mapped = performNotation(notation([writtenNote(0, 72), writtenNote(0, 48, { staff: 2, hand: 'left' })]));
    const legacy = { ...mapped, notes: mapped.notes.map(({ sources: _, ...note }) => note) };
    expect(planOf(legacy)).toEqual(legacyPlanOf(legacy));
  });

  it('sets each hand slow, alone and then to the other heard; both slow, up to tempo, then joins the part to the one before', () => {
    const steps = legacyPlanOf(ode()).map((step) => `${step.kind} ${step.from}–${step.to} ${step.hands} ${step.tempo}${step.aim ? `→${step.aim}` : ''}`);
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
  const kinds = (score: ReturnType<typeof written>) => legacyPlanOf(score).map((step) => `${step.kind} ${step.from + 1}–${step.to + 1}${step.kind === 'alone' || step.kind === 'with' ? ` ${step.hands}` : ''}`);

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
    expect(plan.current).toBe(1);
    expect(plan.next).toBe(1);
  });

  it('migrates old progress by the old step meaning and credits completed full-part preparation', () => {
    const { playback, plan } = practising();
    const old = legacyPlanOf(playback.score!);
    plan.restore({ done: [0, 1] });
    expect(plan.doneSteps).toEqual([]);
    const full = old.findIndex((step) => step.kind === 'together');
    plan.restore({ done: [full] });
    const current = plan.steps.findIndex((step) => step.kind === 'together' && step.from === old[full].from && step.to === old[full].to);
    expect(plan.doneSteps).toContain(current);
    expect(plan.steps.filter((step, index) => plan.doneSteps.includes(index) && step.kind === 'layer')).toHaveLength(2);
    expect(plan.next).toBe(plan.steps.findIndex((step) => step.kind === 'up'));
    plan.restore({ version: PLAN_VERSION + 1, done: [0, 1] });
    expect(plan.doneSteps).toEqual([]);
    plan.restore({ version: PLAN_VERSION, done: [1] });
    expect(plan.doneSteps).toEqual([1]);
  });

  it('starts the next step on entering Learn and advances paused, while a deliberate stop stays stopped', () => {
    const { playback, plan, way } = practising();
    expect(plan.current).toBeNull();
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBe(0);
    expect(playback.noteSelection).not.toBeNull();
    expect(playback.isHandEnabled('right')).toBe(true);
    expect(playback.isHandEnabled('left')).toBe(true);
    const score = playback.score;
    plan.finish();
    expect(plan.current).toBe(1);
    expect(playback.playing).toBe(false);
    expect(playback.score).toBe(score);
    expect(playback.noteSelection).not.toBeNull();
    plan.finish();
    expect(plan.steps[plan.current!].kind).toBe('together');
    expect(playback.noteSelection).toBeNull();
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
    plan.stop();
    playback.setTempo(0.8);
    expect(plan.current).toBeNull();
  });

  it('continues through a manually chosen fragment before returning to earlier unfinished work', () => {
    const { plan, playback } = practising();
    const selected = plan.steps.findIndex((step) => step.kind === 'layer' && step.layer === 'lead' && step.from === 4);
    plan.start(selected);
    plan.clean();
    plan.clean();
    plan.clean();
    expect(plan.current).toBe(selected + 1);
    expect(plan.steps[plan.current!]).toMatchObject({ kind: 'layer', layer: 'lead-bass', from: 4 });
    expect(playback.playing).toBe(false);
    expect(plan.doneSteps).toEqual([selected]);
    plan.set(plan.steps.flatMap((_, index) => index > selected ? [index] : []));
    plan.start(selected);
    plan.finish();
    expect(plan.current).toBe(0);
  });

  it('resumes the unfinished bass step of a later chosen fragment after Listen', () => {
    const { plan, way } = practising();
    const selected = plan.steps.findIndex((step) => step.kind === 'layer' && step.layer === 'lead' && step.from === 4);
    plan.start(selected);
    plan.finish();
    expect(plan.steps[plan.current!].layer).toBe('lead-bass');
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBe(selected + 1);
    expect(plan.steps[plan.current!]).toMatchObject({ kind: 'layer', layer: 'lead-bass', from: 4 });
    expect(plan.doneSteps).toEqual([selected]);
  });

  it('clears the subset on Listen and does not start an old or unrestored plan on raw score load', () => {
    const { playback, plan, way } = practising();
    plan.start(0);
    expect(playback.noteSelection).not.toBeNull();
    way.set('listen');
    expect(plan.current).toBeNull();
    expect(playback.noteSelection).toBeNull();
    playback.load(ode());
    expect(plan.current).toBeNull();
    expect(playback.noteSelection).toBeNull();
  });

  it('starts the first Learn slowly, then preserves a manually set tempo and hands after Listen', () => {
    const { playback, way, plan } = practising();
    way.set('listen');
    way.set('learn');
    expect(playback.tempo).toBe(SLOW);
    playback.setTempo(0.7);
    playback.setHandEnabled('left', false);
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBe(0);
    expect([playback.tempo, playback.isHandEnabled('left')]).toEqual([0.7, false]);
  });

  it('resumes the saved place inside the same guided range', () => {
    const { playback, way, plan } = practising();
    way.set('listen');
    way.set('learn');
    playback.seek(1.2);
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBe(0);
    expect(playback.position).toBeCloseTo(1.2);
  });

  it('preserves an unrelated manual range as free practice instead of crediting the wrong step', () => {
    const { playback, way, plan, barLoop } = practising();
    way.set('listen');
    way.set('learn');
    barLoop.select(3, 6, playback.position);
    playback.seek(playback.loop!.start + 0.2);
    const position = playback.position;
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBeNull();
    expect(plan.doneSteps).toEqual([]);
    expect([barLoop.from, barLoop.to]).toEqual([3, 6]);
    expect(playback.position).toBeCloseTo(position);
    expect(playback.noteSelection).toBeNull();
  });

  it('leaves a saved position outside the next guided part in free practice', () => {
    const { playback, way, plan, barLoop } = practising();
    way.set('listen');
    way.set('learn');
    const position = playback.score!.bars[4] + 0.1;
    barLoop.jumpTo(position);
    way.set('listen');
    way.set('learn');
    expect(plan.current).toBeNull();
    expect(barLoop.enabled).toBe(false);
    expect(playback.position).toBeCloseTo(position);
  });

  it('demonstrates only the current layer and resets it when another piece is loaded', async () => {
    const audio = new FakeAudio();
    const playback = new Playback(audio, new FakeTicker());
    playback.load(performNotation(notation([
      writtenNote(0, 72, { beats: 4 }), writtenNote(0, 48, { staff: 2, voice: '2', hand: 'left' }),
      writtenNote(0.5, 55, { staff: 2, voice: '2', hand: 'left' }),
    ])));
    const barLoop = new BarLoop(playback);
    const trainer = new TempoTrainer(playback);
    const way = new PieceWay(playback, barLoop, trainer);
    const plan = new PracticePlan(playback);
    followPlan(plan, { playback, barLoop, trainer, way });
    way.set('listen');
    way.set('learn');
    expect(plan.steps[plan.current!].layer).toBe('lead');
    await playback.play();
    expect(audio.played.map((note) => note.pitch)).toEqual([72]);
    plan.finish();
    expect(playback.playing).toBe(false);
    expect(plan.doneSteps).toEqual([0]);
    expect(plan.steps[plan.current!].layer).toBe('lead-bass');
    await playback.play();
    expect(audio.played.slice(1).map((note) => note.pitch)).toEqual([48, 72]);
    for (const kind of ['together', 'up']) {
      plan.finish();
      expect(plan.steps[plan.current!].kind).toBe(kind);
      expect(playback.playing).toBe(false);
      audio.played = [];
      await playback.play();
      expect(audio.played.map((note) => note.pitch)).toEqual([48, 72]);
    }
    playback.load(ode());
    expect(plan.current).toBeNull();
    expect(plan.doneSteps).toEqual([]);
    expect(playback.noteSelection).toBeNull();
  });

  it.each(['together', 'up', 'join', 'whole'] as const)('demonstrates both hands in the full %s task', (kind) => {
    const { playback, plan } = practising();
    playback.load(showcase());
    const step = plan.steps.findIndex((step) => step.kind === kind);
    expect(step).toBeGreaterThanOrEqual(0);
    plan.start(step);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
  });

  it('keeps a single-hand fragment audible when its reduced notes become the full chord', async () => {
    const audio = new FakeAudio();
    const playback = new Playback(audio, new FakeTicker());
    playback.load(performNotation(notation([writtenNote(0, 72), writtenNote(0, 67)])));
    const barLoop = new BarLoop(playback);
    const trainer = new TempoTrainer(playback);
    const way = new PieceWay(playback, barLoop, trainer);
    const plan = new PracticePlan(playback);
    followPlan(plan, { playback, barLoop, trainer, way });
    plan.start(0);
    expect(plan.steps[0].kind).toBe('layer');
    plan.finish();
    expect(plan.steps[plan.current!]).toMatchObject({ kind: 'alone', hands: 'right' });
    await playback.play();
    expect(audio.played.map((note) => note.pitch)).toEqual([67, 72]);
  });

  it('demonstrates the chosen hand alone, then together with its accompaniment', () => {
    const { playback, barLoop, trainer, way, plan } = practising();
    const source = playback.score!;
    playback.load({ ...source, notes: source.notes.map(({ sources: _, ...note }) => note) });
    way.set('listen');
    // A hand alone, slow: only the left hand of bars 5–8 is heard.
    plan.start(plan.steps.findIndex((step) => step.kind === 'alone' && step.hands === 'left' && step.from === 4));
    expect(way.way).toBe('learn');
    expect([barLoop.enabled, barLoop.from, barLoop.to, playback.passAtATime]).toEqual([true, 5, 8, true]);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left'), playback.metronomeEnabled]).toEqual([false, true, true]);
    expect(playback.tempo).toBe(SLOW);
    expect(trainer.enabled).toBe(false);
    // The same hand with its accompaniment: the complete example is heard.
    plan.start(plan.steps.findIndex((step) => step.kind === 'with' && step.hands === 'left' && step.from === 4));
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
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

  it.each(['stop', 'finish'] as const)('pauses and releases automatic tempo when the final task is left through %s', async (action) => {
    const { playback, trainer, plan } = practising();
    const up = plan.steps.findIndex((step) => step.kind === 'up');
    plan.set(plan.steps.map((_, index) => index).filter((index) => index !== up));
    plan.start(up);
    await playback.play();
    expect(trainer.enabled).toBe(true);
    expect(playback.playing).toBe(true);
    plan[action]();
    expect(plan.current).toBeNull();
    expect(playback.playing).toBe(false);
    expect(trainer.enabled).toBe(false);
    expect(playback.passAtATime).toBe(false);
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
