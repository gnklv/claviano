import { legacyPlanOf, PLAN_VERSION, planOf, planV2Of, planV3Of, type PlanStep } from '../../domain/practice/plan';
import { SAME_MOMENT } from '../../domain/moment';
import { writtenBarAt, type Score } from '../../domain/score';
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
  private currentScore: Score | null;
  private plan: readonly PlanStep[] = [];
  private done = new Set<number>();
  private active: number | null = null;
  private running = 0;
  private begun = false;
  private preserving = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly playback: Playback, canPlan: (score: Score) => boolean = () => true) {
    // Another piece has a plan of its own (and as far as one had come in it, set from what is remembered).
    let score: Score | null = playback.score;
    this.currentScore = score;
    this.plan = score && canPlan(score) ? planOf(score) : [];
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      this.currentScore = score;
      this.plan = score && canPlan(score) ? planOf(score) : [];
      this.done = new Set();
      this.active = null;
      this.running = 0;
      this.begun = false;
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

  /** During a resumed step's synchronous notification, its learning settings are already restored. */
  get preservingSettings(): boolean {
    return this.preserving;
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

  /** Restores old progress by what each step practised, never by its now-shifted index. */
  restore(saved?: { readonly done: readonly number[]; readonly version?: number }): void {
    if (!saved || saved.version === PLAN_VERSION) {
      this.set(saved?.done ?? []);
      return;
    }
    if ((saved.version !== undefined && saved.version !== 2 && saved.version !== 3) || !this.currentScore) {
      this.set([]);
      return;
    }
    const legacy = saved.version === 3 ? planV3Of(this.currentScore)
      : saved.version === 2 ? planV2Of(this.currentScore) : legacyPlanOf(this.currentScore);
    const done = new Set<number>();
    for (const index of saved.done) {
      const old = Number.isInteger(index) ? legacy[index] : undefined;
      if (!old) continue;
      // Older tasks included the decorations: passing them also satisfies their plain preparation.
      const matched = this.plan.findIndex((step) => meaning(step, true) === meaning(old, true));
      if (matched < 0) continue;
      done.add(matched);
      const hands = new Set(this.currentScore.notation.notes.filter((note) => note.bar >= old.from && note.bar <= old.to).map((note) => note.hand));
      const fullAlone = old.kind === 'alone' && hands.size === 1 && old.hands !== 'both' && hands.has(old.hands);
      if (old.kind === 'together' || old.kind === 'up' || fullAlone) {
        this.plan.forEach((step, index) => {
          if (step.kind === 'layer' && step.from === old.from && step.to === old.to) done.add(index);
        });
      }
    }
    this.set([...done]);
  }

  /** Begins the first unfinished step after entering Learn or restoring its saved progress. */
  resume(options: { preserveSettings?: boolean } = {}): void {
    if (this.currentScore !== this.playback.score || this.active !== null || this.next === null) return;
    const preserve = options.preserveSettings ?? this.begun;
    if (preserve) this.begun = true;
    let next = this.next;
    const loop = this.playback.loop;
    if (preserve && loop && this.currentScore) {
      const from = writtenBarAt(this.currentScore, loop.start);
      const to = writtenBarAt(this.currentScore, loop.end - SAME_MOMENT);
      const matching = this.plan.findIndex((step, index) => !this.done.has(index) && step.from === from && step.to === to);
      if (matching < 0) return;
      next = matching;
    }
    this.preserving = preserve;
    try {
      this.start(next);
    } finally {
      this.preserving = false;
    }
  }

  /** Begins a step: its count from nothing. */
  start(index: number): void {
    if (!this.plan[index]) return;
    if (this.active === index) this.stop();
    this.playback.clearCompletedPass();
    this.active = index;
    this.begun = true;
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
    const step = this.plan[this.active]!;
    if (step.kind === 'up') {
      const tempo = this.playback.lastCompletedPassTempo ?? this.playback.tempo;
      this.prepareTempo(Math.min(step.aim ?? step.tempo, tempo + (step.by ?? 0)));
      if (tempo < (step.aim ?? step.tempo) - SAME_MOMENT) {
        this.running = 0;
        this.emit();
        return;
      }
    }
    this.running++;
    if (this.running >= PASSES_TO_DONE) this.finish();
    else this.emit();
  }

  /** A pass with a slip: the count starts again. */
  missed(): void {
    const step = this.active === null ? undefined : this.plan[this.active];
    if (step?.kind === 'up') {
      const tempo = this.playback.lastCompletedPassTempo ?? this.playback.tempo;
      this.prepareTempo(Math.min(tempo, Math.max(step.tempo, tempo - (step.by ?? 0))));
      this.running = 0;
      this.emit();
      return;
    }
    this.playback.clearCompletedPass();
    if (this.active === null || this.running === 0) return;
    this.running = 0;
    this.emit();
  }

  /** Continues after the chosen step; earlier unfinished work waits until its following steps end. */
  finish(): void {
    if (this.active === null) return;
    const completed = this.active;
    this.done.add(this.active);
    const following = this.plan.findIndex((_, index) => index > completed && !this.done.has(index));
    this.active = following >= 0 ? following : this.next;
    this.running = 0;
    this.emit();
  }

  /** The plan from its beginning: nothing done. */
  restart(): void {
    this.stop();
    this.done = new Set();
    this.running = 0;
    this.begun = false;
    if (this.plan.length) this.start(0);
    else this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Assessment prepares the next attempt, whether the last one used playback or a physical piano. */
  private prepareTempo(tempo: number): void {
    this.playback.pause();
    this.playback.seek(this.playback.loop?.start ?? this.playback.position);
    this.playback.setTempo(Math.round(tempo * 100) / 100);
  }
}

const meaning = (step: PlanStep, withoutPlain = false): string => JSON.stringify([step.kind, step.from, step.to, step.hands, step.tempo, step.aim, step.by, step.layer, step.addedHand, withoutPlain ? undefined : step.plain]);
