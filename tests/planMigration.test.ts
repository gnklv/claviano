import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { performNotation } from '../src/domain/notation/performance';
import { spell } from '../src/domain/notation/spelling';
import { legacyPlanOf, PLAN_VERSION, planOf, planV2Of } from '../src/domain/practice/plan';
import { FakeAudio, FakeTicker } from './fakes';
import { notation, written } from './layerScoreFixtures';

const score = () => performNotation(notation([
  written(0, 72, { beats: 4 }), written(0, 84, { beats: 4, chord: true }),
  written(1, 67, { voice: '2' }), written(0, 48, { staff: 2, voice: '2', hand: 'left' }),
  written(0.5, 55, { staff: 2, voice: '2', hand: 'left' }),
]));

function setup(source = score()) {
  const playback = new Playback(new FakeAudio(), new FakeTicker());
  playback.load(source);
  return new PracticePlan(playback);
}

describe('plans with the full leading hand', () => {
  it('adds one distinct preparation step and retains the exact version-two ladder for migration', () => {
    const source = score();
    expect(PLAN_VERSION).toBe(4);
    expect(planOf(source).map(({ kind, layer, addedHand }) => ({ kind, layer, addedHand }))).toEqual([
      { kind: 'layer', layer: 'lead', addedHand: undefined },
      { kind: 'layer', layer: 'lead-bass', addedHand: undefined },
      { kind: 'layer', layer: 'lead-hand-bass', addedHand: 'right' },
      { kind: 'together', layer: undefined, addedHand: undefined },
      { kind: 'up', layer: undefined, addedHand: undefined },
    ]);
    expect(planV2Of(source)).toEqual(planOf(source).filter((step) => step.layer !== 'lead-hand-bass'));
    expect(planV2Of(source)).toEqual([
      { kind: 'layer', layer: 'lead', from: 0, to: 0, hands: 'right', tempo: 0.6 },
      { kind: 'layer', layer: 'lead-bass', from: 0, to: 0, hands: 'both', tempo: 0.6 },
      { kind: 'together', from: 0, to: 0, hands: 'both', tempo: 0.6 },
      { kind: 'up', from: 0, to: 0, hands: 'both', tempo: 0.6, aim: 1, by: 0.1 },
    ]);
    expect(legacyPlanOf(source).map((step) => step.kind)).toEqual(['alone', 'with', 'alone', 'with', 'together', 'up']);
  });

  it('maps version-two progress by meaning without giving a bass-only completion credit for the new hand step', () => {
    const plan = setup();
    plan.restore({ version: 2, done: [1] });
    expect(plan.doneSteps).toEqual([1]);
    plan.restore({ version: 2, done: [2] });
    expect(plan.doneSteps).toEqual([0, 1, 2, 3]);
    expect(plan.next).toBe(4);
    plan.restore({ version: 2, done: [3] });
    expect(plan.doneSteps).toEqual([0, 1, 2, 4]);
  });

  it('migrates unversioned hand exercises without mistaking their indices for the new preparation', () => {
    const plan = setup();
    plan.restore({ done: [2] });
    expect(plan.doneSteps).toEqual([]);
    plan.restore({ done: [4] });
    expect(plan.doneSteps).toEqual([0, 1, 2, 3]);
    plan.restore({ version: 3, done: [2] });
    expect(plan.doneSteps).toEqual([2]);
    plan.restore({ version: 5, done: [0, 1, 2] });
    expect(plan.doneSteps).toEqual([]);
  });

  it('maps later-part version-two progress after a new hand step shifts the earlier indices', () => {
    const first = score().notation.notes;
    const source = performNotation(notation([
      ...first,
      ...first.map((note) => ({ ...note, bar: note.bar + 4, beat: note.beat + 16, sounding: note.sounding + 2, pitch: spell(note.sounding + 2, 0) })),
      written(28, 78, { beats: 4 }),
    ]));
    const plan = setup(source);
    const old = planV2Of(source);
    const saved = old.findIndex((step) => step.layer === 'lead' && step.from === 4);
    const mapped = plan.steps.findIndex((step) => step.layer === 'lead' && step.from === 4);
    expect([saved, mapped]).toEqual([4, 5]);
    plan.restore({ version: 2, done: [saved] });
    expect(plan.doneSteps).toEqual([mapped]);
    expect(plan.steps[mapped]).toEqual(old[saved]);
    expect(plan.steps[saved]).toMatchObject({ kind: 'up', from: 0, to: 3 });
    expect(plan.doneSteps).not.toContain(saved);
  });

  it('credits preparation from an older complete one-hand part, including its full alone step', () => {
    const source = performNotation(notation([
      written(0, 84), written(0, 72, { chord: true }), written(1, 74), written(2, 60, { hidden: true }),
    ]));
    const plan = setup(source);
    expect(plan.steps.map((step) => step.layer ?? step.kind)).toEqual(['lead', 'lead-hand-bass', 'alone', 'up']);
    plan.restore({ version: 2, done: [1] });
    expect(plan.doneSteps).toEqual([0, 1, 2]);
    plan.restore({ done: [0] });
    expect(plan.doneSteps).toEqual([0, 1, 2]);
  });
});
