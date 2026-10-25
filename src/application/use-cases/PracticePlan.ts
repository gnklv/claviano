import { planOf, type PlanStep } from '../../domain/practice/plan';
import type { Score } from '../../domain/score';
import type { Playback } from './Playback';

/*
 * The plan for learning the open piece (see domain/practice/plan.ts), and how far one has come in
 * it. A step is begun, played round its loop, and after each pass marked clean or not: three clean
 * passes running and it is done (a slip starts the count again). What predicts how a passage is
 * played the next day is how many of the tries were right, a slip stopped at and mended at once,
 * not how long it was practised (Duke, Simmons and Cash, 2009). A step may also be closed by hand.
 * The microphone will mark the passes itself one day; the steps stay as they are.
 */

/** Clean passes running that make a step done. */
export const PASSES_TO_DONE = 3;

/** How a step stands: the clean passes running now, and whether it is done. */
export interface StepProgress {
  readonly clean: number;
  readonly done: boolean;
}

export class PracticePlan {
  private plan: readonly PlanStep[] = [];
  private done = new Set<number>();
  private active: number | null = null;
  private running = 0;
  private readonly listeners = new Set<() => void>();

  constructor(playback: Playback) {
    // Another piece has a plan of its own (and as far as one had come in it, set from what is remembered).
    let score: Score | null = playback.score;
    this.plan = score ? planOf(score) : [];
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      this.plan = score ? planOf(score) : [];
      this.done = new Set();
      this.active = null;
      this.running = 0;
      this.emit();
    });
  }

  get steps(): readonly PlanStep[] {
    return this.plan;
  }

  /** The step being played now, by its place in the plan (null: none). */
  get current(): number | null {
    return this.active;
  }

  /** The first step not yet done, by its place (null: all are). */
  get next(): number | null {
    const index = this.plan.findIndex((_, i) => !this.done.has(i));
    return index < 0 ? null : index;
  }

  /** The steps done, by their places: what is kept with the piece. */
  get doneSteps(): readonly number[] {
    return [...this.done].sort((a, b) => a - b);
  }

  progress(index: number): StepProgress {
    return { clean: index === this.active ? this.running : 0, done: this.done.has(index) };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** As far as one had come in the plan, as kept with the piece (places past its end let go of). */
  set(done: readonly number[]): void {
    this.done = new Set(done.filter((index) => Number.isInteger(index) && index >= 0 && index < this.plan.length));
    this.active = null;
    this.running = 0;
    this.emit();
  }

  /** Begins a step: its count from nothing. */
  start(index: number): void {
    if (!this.plan[index]) return;
    this.active = index;
    this.running = 0;
    this.emit();
  }

  /** Leaves the step being played, as it stands. */
  stop(): void {
    if (this.active === null) return;
    this.active = null;
    this.running = 0;
    this.emit();
  }

  /** A clean pass of the step being played: enough of them running, and it is done. */
  clean(): void {
    if (this.active === null) return;
    this.running++;
    if (this.running >= PASSES_TO_DONE) this.finish();
    else this.emit();
  }

  /** A pass with a slip: the count starts again. */
  missed(): void {
    if (this.active === null || this.running === 0) return;
    this.running = 0;
    this.emit();
  }

  /** The step being played is done (enough clean passes, or closed by hand): the plan stands at none. */
  finish(): void {
    if (this.active === null) return;
    this.done.add(this.active);
    this.active = null;
    this.running = 0;
    this.emit();
  }

  /** The plan from its beginning: nothing done. */
  restart(): void {
    this.done = new Set();
    this.active = null;
    this.running = 0;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
