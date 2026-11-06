import type { Hand } from '../../domain/note';
import type { PlanStep } from '../../domain/practice/plan';
import { layersOf } from '../../domain/practice/layers';
import { scoreForLayer } from '../../domain/practice/layerScore';
import { timeAtPage, writtenBarAt, writtenBarNumber, writtenBarStart } from '../../domain/score';
import type { BarLoop } from './BarLoop';
import type { PieceWay } from './PieceWay';
import type { Playback } from './Playback';
import type { PracticePlan } from './PracticePlan';
import type { TempoTrainer } from './TempoTrainer';

/*
 * A step of the plan, begun, sets what it is played with, each by what holds it: the loop on its
 * bars, played a pass at a time (a pass, then a word on how it went, then the next when one is
 * ready); the metronome; its tempo (or the trainer, from it to the tempo aimed at, two steps up and
 * one back); and the piece learnt, not listened to. Each task is heard as an example: the chosen
 * hand alone, or both hands together. The learner can mute either hand with the existing controls.
 *
 * Out of the plan the music is as it was: both hands heard, the loop going round, the metronome as
 * it was before the first step.
 *
 * The loop changed by hand while a step is played leaves the step: one is practising other bars
 * now, and the count of clean passes would count something else.
 */

const HANDS: readonly Hand[] = ['right', 'left'];

/** Demonstrate the task; a reduced layer is selected independently of hand audibility. */
const heard = (step: PlanStep, hand: Hand): boolean => step.kind !== 'alone' || step.hands === 'both' || step.hands === hand;

export function followPlan(plan: PracticePlan, { playback, barLoop, trainer, way }: { playback: Playback; barLoop: BarLoop; trainer: TempoTrainer; way: PieceWay }): void {
  let shown: number | null = null;
  /** While a step's settings are being made, the changes they make are not news of their own. */
  let setting = false;
  /** The loop's bars the step being played set. */
  let set: { from: number; to: number } | null = null;
  /** Whether the metronome was on before the steps: as it is to be after them. */
  let metronome: boolean | null = null;

  plan.onChange(() => {
    const index = plan.current;
    if (index === shown) return;
    shown = index;
    set = null;
    const step = index === null ? undefined : plan.steps[index];
    const score = playback.score;
    if (!step || !score) {
      playback.setNoteSelection(null);
      if (metronome === null) return;
      playback.pause();
      trainer.setEnabled(false);
      playback.setPassAtATime(false);
      for (const hand of HANDS) playback.setHandEnabled(hand, true);
      playback.setMetronomeEnabled(metronome);
      metronome = null;
      return;
    }
    const from = writtenBarNumber(score, step.from);
    const to = writtenBarNumber(score, step.to);
    const position = playback.position;
    const written = writtenBarAt(score, position);
    const sameRange = !barLoop.enabled || (Math.min(barLoop.from, barLoop.to) === from && Math.max(barLoop.from, barLoop.to) === to);
    const inside = written >= step.from && written <= step.to;
    if (plan.preservingSettings && (!sameRange || !inside)) {
      // A manually chosen passage is not a pass of the next guided step.
      plan.stop();
      return;
    }
    setting = true;
    const kept = plan.preservingSettings ? (way.learning ?? {
      tempo: playback.tempo,
      hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
      trainer: { on: trainer.enabled, plan: { ...trainer.plan } },
    }) : null;
    metronome ??= playback.metronomeEnabled;
    way.set('learn');
    playback.pause();
    const part = { from: step.from, to: step.to };
    const layer = step.kind === 'layer' ? layersOf(score, part).layers.find((layer) => layer.kind === step.layer) : undefined;
    const selected = layer ? new Set(scoreForLayer(score, part, layer).notes) : null;
    playback.setNoteSelection(selected ? score.notes.flatMap((note, index) => selected.has(note) ? [index] : []) : null);
    // (The first pass of its bars, where the piece repeats them.)
    barLoop.select(from, to, kept ? position : timeAtPage(score, step.from, writtenBarStart(score, step.from), 0));
    playback.setPassAtATime(true);
    for (const hand of HANDS) playback.setHandEnabled(hand, heard(step, hand));
    playback.setMetronomeEnabled(true);
    if (step.kind === 'up' && step.aim !== undefined && step.by !== undefined) {
      // (A step at each pass: how many passes a tempo takes is the step's three clean ones at the end.)
      trainer.setPlan({ from: step.tempo, to: step.aim, step: step.by, every: 1, back: true });
      // (Begun again from its first tempo, if it was on already.)
      trainer.setEnabled(false);
      trainer.setEnabled(true);
    } else {
      trainer.setEnabled(false);
      playback.setTempo(step.tempo);
    }
    const range = playback.loop;
    playback.seek(kept && range && position >= range.start && position < range.end ? position : range?.start ?? 0);
    if (kept) {
      playback.setTempo(kept.tempo);
      for (const hand of HANDS) playback.setHandEnabled(hand, kept.hands[hand]);
      trainer.restore(kept.trainer);
    }
    set = { from, to };
    setting = false;
  });

  const touched = (): void => {
    if (setting || !set || plan.current === null) return;
    if (!barLoop.enabled || barLoop.from !== set.from || barLoop.to !== set.to) plan.stop();
  };
  barLoop.onChange(touched);
  playback.onChange(touched);
  way.onChange(() => {
    if (setting) return;
    if (way.way === 'learn') plan.resume();
    else {
      plan.stop();
      playback.setNoteSelection(null);
    }
  });
}
