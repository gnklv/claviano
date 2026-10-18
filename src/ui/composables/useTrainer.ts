import type { TempoTrainer, TrainerPlan } from '../../application/use-cases/TempoTrainer';
import { useMirror } from './useMirror';

export interface TrainerSnapshot {
  readonly on: boolean;
  readonly plan: TrainerPlan;
}

/** The tempo trainer, mirrored: whether it is on, and how it goes. */
export const useTrainer = (trainer: TempoTrainer) => useMirror(trainer, (): TrainerSnapshot => ({ on: trainer.enabled, plan: trainer.plan }));
