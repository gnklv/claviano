import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { performNotation } from '../src/domain/notation/performance';
import { spell } from '../src/domain/notation/spelling';
import * as plans from '../src/domain/practice/plan';
import { FakeAudio, FakeTicker } from './fakes';
import { grace, notation, written } from './layerScoreFixtures';

const trill = { kind: 'trill' as const, accidentalAbove: null, accidentalBelow: null, below: false };
const decorated = () => performNotation(notation([
  written(0, 72, { beats: 4 }), written(0, 84, { beats: 4, chord: true, ornaments: [trill] }),
  written(1, 67, { voice: '2' }), written(0, 48, { staff: 2, voice: '2', hand: 'left' }),
  written(0.5, 55, { staff: 2, voice: '2', hand: 'left' }),
]));

function practice(source = decorated()) {
  const playback = new Playback(new FakeAudio(), new FakeTicker());
  playback.load(source);
  return new PracticePlan(playback);
}

describe('preparing a fragment without ornaments', () => {
  it('reconstructs the exact version-three decorated plan for saved indices', () => {
    expect(plans.planV3Of(decorated())).toEqual([
      { kind: 'layer', layer: 'lead', from: 0, to: 0, hands: 'right', tempo: 0.6 },
      { kind: 'layer', layer: 'lead-bass', from: 0, to: 0, hands: 'both', tempo: 0.6 },
      { kind: 'layer', layer: 'lead-hand-bass', addedHand: 'right', from: 0, to: 0, hands: 'both', tempo: 0.6 },
      { kind: 'together', from: 0, to: 0, hands: 'both', tempo: 0.6 },
      { kind: 'up', from: 0, to: 0, hands: 'both', tempo: 0.6, aim: 1, by: 0.1 },
    ]);
  });

  it('prepares each reduced layer and the complete plain fragment before the original full task', () => {
    const steps = plans.planOf(decorated());
    expect(steps.map((step) => ({ kind: step.kind, layer: step.layer, plain: 'plain' in step ? step.plain : undefined }))).toEqual([
      { kind: 'layer', layer: 'lead', plain: true },
      { kind: 'layer', layer: 'lead-bass', plain: true },
      { kind: 'layer', layer: 'lead-hand-bass', plain: true },
      { kind: 'layer', layer: 'full', plain: true },
      { kind: 'together', layer: undefined, plain: undefined },
      { kind: 'up', layer: undefined, plain: undefined },
    ]);
    expect(steps[4]).toMatchObject({ kind: 'together', restoreOrnaments: true });
    expect(steps.filter((step) => 'restoreOrnaments' in step)).toHaveLength(1);
  });

  it('prepares a monophonic decorated fragment even when no written layer can be reduced', () => {
    const source = performNotation(notation([written(0, 72, { ornaments: [trill] })]));
    expect(plans.planOf(source).map((step) => step.layer ?? step.kind)).toEqual(['full', 'alone', 'up']);
  });

  it('omits full plain preparation when a reduced written layer already plays the complete tied event', () => {
    const source = performNotation(notation([
      written(0, 72, { tieStart: true, ornaments: [trill] }),
      written(1, 72, { tieStop: true, voice: '2' }),
    ]));
    expect(plans.planOf(source).map((step) => step.layer ?? step.kind)).toEqual(['lead', 'alone', 'up']);
    expect(plans.planOf(source)[0]).toMatchObject({ layer: 'lead', plain: true });
    expect(plans.planOf(source)[1]).toMatchObject({ kind: 'alone', restoreOrnaments: true });
  });

  it('prepares grace notes without requiring an ornament sign', () => {
    const source = performNotation(notation([written(0, 72)], {
      graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [grace(74, { slash: false })] }],
    }));
    expect(plans.planOf(source)[0]).toMatchObject({ kind: 'layer', layer: 'full', plain: true });
  });

  it('does not add plain tasks for tremolos or arpeggios alone', () => {
    const source = performNotation(notation([
      written(0, 72, { tremolo: { type: 'single', strokes: 2 } }), written(1, 74, { arpeggio: 'up' }),
    ]));
    expect(plans.planOf(source).map((step) => step.layer ?? step.kind)).toEqual(['alone', 'up']);
    expect(plans.planOf(source).some((step) => 'restoreOrnaments' in step)).toBe(false);
  });

  it('falls back to the original tasks when performed-note provenance is incomplete', () => {
    const source = decorated();
    const old = { ...source, notes: source.notes.map(({ sources: _, ...note }) => note) };
    expect(plans.planOf(old).map((step) => step.kind)).toEqual(['alone', 'with', 'alone', 'with', 'together', 'up']);
  });

  it('credits the corresponding plain layer from version-three decorated practice without crediting the new full preparation', () => {
    const plan = practice();
    plan.restore({ version: 3, done: [2] });
    expect(plan.doneSteps).toEqual([2]);
    expect(plan.steps[2]).toMatchObject({ layer: 'lead-hand-bass', plain: true });
    expect(plan.doneSteps).not.toContain(3);
  });

  it('credits all preparations from a completed version-three original full fragment', () => {
    const plan = practice();
    plan.restore({ version: 3, done: [3] });
    expect(plan.doneSteps).toEqual([0, 1, 2, 3, 4]);
    expect(plan.next).toBe(5);
  });

  it('restores a later version-three fragment after earlier plain preparation shifted its index', () => {
    const first = decorated().notation.notes;
    const source = performNotation(notation([
      ...first,
      ...first.map((note) => ({ ...note, bar: note.bar + 4, beat: note.beat + 16, sounding: note.sounding + 2, pitch: spell(note.sounding + 2, 0) })),
      written(28, 78, { beats: 4 }),
    ]));
    const plan = practice(source);
    const old = plans.planV3Of(source);
    const saved = old.findIndex((step) => step.layer === 'lead' && step.from === 4);
    const current = plan.steps.findIndex((step) => step.layer === 'lead' && step.from === 4);
    expect([saved, current]).toEqual([5, 6]);
    plan.restore({ version: 3, done: [saved] });
    expect(plan.doneSteps).toEqual([current]);
    expect(plan.steps[current]).toMatchObject({ ...old[saved], plain: true });
    expect(plan.steps[saved]).toMatchObject({ kind: 'up', from: 0, to: 3 });
  });

  it('does not promote a new plain completion to original full completion', () => {
    const plan = practice();
    plan.restore({ version: 4, done: [3] });
    expect(plan.doneSteps).toEqual([3]);
    expect(plan.steps[3]).toMatchObject({ layer: 'full', plain: true });
  });

  it('prepares a decorated reprise even when its principal notes were already learnt bare', () => {
    const source = performNotation(notation(Array.from({ length: 8 }, (_, bar) =>
      written(bar * 4, 72, { beats: 4, ornaments: bar >= 4 ? [trill] : [] }),
    )));
    expect(plans.planOf(source).filter((step) => step.from === 4 && step.to === 7).map((step) => step.layer ?? step.kind))
      .toEqual(['full', 'alone', 'up']);
    expect(plans.planV3Of(source).filter((step) => step.from === 4 && step.to === 7)).toEqual([]);
  });
});
