import type { ExerciseHands, ExerciseId, ExerciseLevel } from '../../domain/exercises/catalog';
import { exerciseScore } from '../../domain/exercises/score';
import { planWarmup, type WarmupMinutes, type WarmupStep } from '../../domain/exercises/warmup';

export type WarmupSelection =
  | { readonly mode: 'warmup'; readonly level: ExerciseLevel; readonly minutes: WarmupMinutes }
  | { readonly mode: 'exercise'; readonly exerciseId: ExerciseId; readonly hands: ExerciseHands };
export type WarmupStatus = 'idle' | 'active' | 'away' | 'finished';

/** The visit's exercise queue. Moving on says nothing about how well a task was played. */
export class WarmupSession {
  private phase: WarmupStatus = 'idle';
  private choice: WarmupSelection | null = null;
  private queue: readonly WarmupStep[] = [];
  private index: number | null = null;
  private readonly listeners = new Set<() => void>();

  get status(): WarmupStatus { return this.phase; }
  get selection(): WarmupSelection | null { return this.choice; }
  get steps(): readonly WarmupStep[] { return this.queue; }
  get current(): number | null { return this.index; }
  get step(): WarmupStep | null { return this.index === null ? null : this.queue[this.index] ?? null; }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(level: ExerciseLevel, minutes: WarmupMinutes): void {
    const warmup = planWarmup(level, minutes);
    this.begin({ mode: 'warmup', level, minutes }, warmup.steps);
  }

  startExercise(exerciseId: ExerciseId, hands: ExerciseHands): void {
    // Validate and measure before replacing a session that may still be in progress.
    const score = exerciseScore(exerciseId, hands);
    this.begin({ mode: 'exercise', exerciseId, hands }, [{ exerciseId, hands, repetitions: 1, estimatedSeconds: score.duration }]);
  }

  next(): void {
    if (this.phase !== 'active' || this.index === null || this.index + 1 >= this.queue.length) return;
    this.index++;
    this.emit();
  }

  leave(): void {
    if (this.phase !== 'active') return;
    this.phase = 'away';
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'away') return;
    this.phase = 'active';
    this.emit();
  }

  /** May be finished early; the final task also waits for this explicit action. */
  finish(): void {
    if (this.phase !== 'active' && this.phase !== 'away') return;
    this.phase = 'finished';
    this.emit();
  }

  restart(): void {
    const selection = this.choice;
    if (!selection) return;
    if (selection.mode === 'warmup') this.start(selection.level, selection.minutes);
    else this.startExercise(selection.exerciseId, selection.hands);
  }

  private begin(choice: WarmupSelection, steps: readonly WarmupStep[]): void {
    this.choice = choice;
    this.queue = steps;
    this.index = 0;
    this.phase = 'active';
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
