import type { PracticePlan } from '../../application/use-cases/PracticePlan';
import type { PlanStep } from '../../domain/practice/plan';
import { useMirror } from './useMirror';

export interface PlanSnapshot {
  readonly steps: readonly PlanStep[];
  /** The step being played, the first not yet done (null: none, all), and those done, by their places. */
  readonly current: number | null;
  readonly next: number | null;
  readonly done: ReadonlySet<number>;
  /** The clean passes running of the step being played. */
  readonly clean: number;
}

/** The plan for learning the open piece, mirrored: its steps, and how far one has come in them. */
export const usePracticePlan = (plan: PracticePlan) =>
  useMirror(
    plan,
    (): PlanSnapshot => ({
      steps: plan.steps,
      current: plan.current,
      next: plan.next,
      done: new Set(plan.doneSteps),
      clean: plan.current === null ? 0 : plan.progress(plan.current).clean,
    }),
  );
