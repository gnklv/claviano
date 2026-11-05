import { exercisesFor, type ExerciseHands, type ExerciseId, type ExerciseLevel } from './catalog';
import { exerciseScore } from './score';

export type WarmupMinutes = 5 | 10 | 15;

export interface WarmupStep {
  readonly exerciseId: ExerciseId;
  readonly hands: ExerciseHands;
  /** Suggested passes of the whole exercise; the player may move on sooner. */
  readonly repetitions: number;
  readonly estimatedSeconds: number;
}

export interface Warmup {
  readonly level: ExerciseLevel;
  readonly minutes: WarmupMinutes;
  readonly steps: readonly WarmupStep[];
  /** Playing time at the suggested tempos, without preparation or manual pauses. */
  readonly estimatedSeconds: number;
}

export function planWarmup(level: ExerciseLevel, minutes: WarmupMinutes): Warmup {
  if (![5, 10, 15].includes(minutes)) throw new RangeError('Choose 5, 10 or 15 minutes');
  const exercises = exercisesFor(level).filter(exercise => exercise.warmup);
  if (!exercises.length) throw new RangeError('Unknown exercise level');

  const groups = exercises.map(exercise => {
    const hands: readonly ExerciseHands[] = exercise.hands.includes('both') ? ['both'] : exercise.hands;
    const passes = hands.map(hand => ({ hands: hand, seconds: exerciseScore(exercise.id, hand).duration }));
    return {
      id: exercise.id,
      passes,
      seconds: passes.reduce((sum, pass) => sum + pass.seconds, 0),
      repetitions: 1,
    };
  });

  const target = minutes * 60;
  let total = groups.reduce((sum, group) => sum + group.seconds, 0);
  while (total < target) {
    // Add to the least-practised task per hand. A separate-hand pair always grows together.
    const next = groups.reduce((least, group) =>
      group.seconds * group.repetitions / group.passes.length < least.seconds * least.repetitions / least.passes.length
        ? group : least,
    );
    if (Math.abs(total + next.seconds - target) >= target - total) break;
    next.repetitions++;
    total += next.seconds;
  }

  const steps = groups.flatMap(group => group.passes.map(pass => ({
    exerciseId: group.id,
    hands: pass.hands,
    repetitions: group.repetitions,
    estimatedSeconds: pass.seconds * group.repetitions,
  })));
  return { level, minutes, steps, estimatedSeconds: steps.reduce((sum, step) => sum + step.estimatedSeconds, 0) };
}
