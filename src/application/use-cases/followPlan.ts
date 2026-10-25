import type { Hand } from '../../domain/note';
import { timeAtPage, writtenBarNumber, writtenBarStart } from '../../domain/score';
import type { BarLoop } from './BarLoop';
import type { PieceWay } from './PieceWay';
import type { Playback } from './Playback';
import type { PracticePlan } from './PracticePlan';
import type { TempoTrainer } from './TempoTrainer';

/*
 * A step of the plan, begun, sets what it is played with, each by what holds it: the loop on its
 * bars, the hands it is for, its tempo (or the trainer, from it to the tempo aimed at, two steps up
 * and one back), and the piece learnt, not listened to. Played from the loop's start.
 *
 * The loop or a hand changed by hand while a step is played leaves the step: one is practising in
 * one's own way now, and the count of clean passes would count something else.
 */

const HANDS: readonly Hand[] = ['right', 'left'];

export function followPlan(plan: PracticePlan, { playback, barLoop, trainer, way }: { playback: Playback; barLoop: BarLoop; trainer: TempoTrainer; way: PieceWay }): void {
  let shown: number | null = null;
  /** While a step's settings are being made, the changes they make are not news of their own. */
  let setting = false;
  /** What the step being played set: the loop's bars, and the hands. */
  let set: { from: number; to: number; hands: Readonly<Record<Hand, boolean>> } | null = null;

  plan.onChange(() => {
    const index = plan.current;
    if (index === shown) return;
    shown = index;
    set = null;
    const step = index === null ? undefined : plan.steps[index];
    const score = playback.score;
    if (!step || !score) return;
    setting = true;
    way.set('learn');
    const from = writtenBarNumber(score, step.from);
    const to = writtenBarNumber(score, step.to);
    // (The first pass of its bars, where the piece repeats them.)
    barLoop.select(from, to, timeAtPage(score, step.from, writtenBarStart(score, step.from), 0));
    const hands = { right: step.hands !== 'left', left: step.hands !== 'right' };
    for (const hand of HANDS) playback.setHandEnabled(hand, hands[hand]);
    if (step.kind === 'up' && step.aim !== undefined) {
      trainer.setPlan({ from: step.tempo, to: step.aim, back: true });
      // (Begun again from its first tempo, if it was on already.)
      trainer.setEnabled(false);
      trainer.setEnabled(true);
    } else {
      trainer.setEnabled(false);
      playback.setTempo(step.tempo);
    }
    playback.seek(playback.loop?.start ?? 0);
    set = { from, to, hands };
    setting = false;
  });

  const touched = (): void => {
    if (setting || !set || plan.current === null) return;
    const loopMoved = !barLoop.enabled || barLoop.from !== set.from || barLoop.to !== set.to;
    const handMoved = HANDS.some((hand) => playback.isHandEnabled(hand) !== set!.hands[hand]);
    if (loopMoved || handMoved) plan.stop();
  };
  barLoop.onChange(touched);
  playback.onChange(touched);
}
