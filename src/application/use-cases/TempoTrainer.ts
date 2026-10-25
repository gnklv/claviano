import { SAME_MOMENT } from '../../domain/moment';
import type { Playback } from './Playback';
import { PRACTICE_TEMPO } from './stepTempo';

/*
 * The tempo trainer: a loop that quickens by itself, a little each time round, from the tempo it is
 * begun at to the one aimed at. Playback plays each pass at the tempo set for it; this says which.
 *
 * Its steps may go two up and one back (60, 64, 62, 66, 64…): a tempo is then not only climbed to
 * but come back to, from above, and played again a little slower than the one just reached.
 */

/** How the trainer goes: from what tempo to what, by how much a step, and after how many passes (tempos as shares of the piece's own). */
export interface TrainerPlan {
  readonly from: number;
  readonly to: number;
  readonly step: number;
  /** A step after this many passes at a tempo. */
  readonly every: number;
  /** Two steps up, then one back, in turn; otherwise a step up each time. */
  readonly back: boolean;
}

/** What is offered: the steps, and the passes between them. */
export const TRAINER_STEPS = [0.01, 0.02, 0.05] as const;
export const TRAINER_PASSES = [1, 2, 3] as const;

/** From 60% to the piece's own tempo, 2% a pass: twenty passes, slow enough for the hands to keep up. */
export const DEFAULT_PLAN: TrainerPlan = { from: 0.6, to: 1, step: 0.02, every: 1, back: false };

/** The trainer as it was left with a piece: whether it was on, and how it goes. */
export interface TrainerState {
  readonly on: boolean;
  readonly plan: TrainerPlan;
}

/** A tempo to the hundredth: 0.6 + 0.02 is not 0.62 in floating point. */
const hundredth = (tempo: number): number => Math.round(tempo * 100) / 100;
const within = (tempo: number): number => hundredth(Math.min(PRACTICE_TEMPO.max, Math.max(PRACTICE_TEMPO.min, tempo)));

export class TempoTrainer {
  private on = false;
  private current: TrainerPlan = DEFAULT_PLAN;
  /** The loop's rounds counted so far, and the passes played at the tempo now. */
  private rounds = 0;
  private passes = 0;
  private tempo = Number.NaN;
  /** Steps taken since the trainer began, or since a tempo was set by hand: with steps back, which comes next. */
  private moves = 0;
  private wasPlaying = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly playback: Playback) {
    playback.onChange(() => this.follow());
  }

  get enabled(): boolean {
    return this.on;
  }

  get plan(): TrainerPlan {
    return this.current;
  }

  /** Whether the tempo aimed at has been reached: the loop goes on at it. */
  get reached(): boolean {
    return this.on && this.playback.tempo >= this.current.to - SAME_MOMENT;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** On, the trainer begins again: at its first tempo. Off, the tempo stays where it has come to. */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) this.begin();
    else this.playback.setTempoAtLoop(null);
    this.emit();
  }

  /** Another way to go: begun again from its first tempo, if the trainer is on. */
  setPlan(plan: Partial<TrainerPlan>): void {
    const next = { ...this.current, ...plan };
    const from = within(next.from);
    this.current = { from, to: Math.max(from, within(next.to)), step: next.step, every: Math.max(1, Math.round(next.every)), back: next.back };
    if (this.on) this.begin();
    this.emit();
  }

  /** As it was left with a piece, the tempo as it was: a piece comes back to where its training had got. */
  restore(state: TrainerState): void {
    this.on = false;
    this.setPlan(state.plan);
    this.on = state.on;
    this.passes = 0;
    this.moves = 0;
    this.tempo = this.playback.tempo;
    this.decide();
    this.emit();
  }

  private begin(): void {
    this.passes = 0;
    this.moves = 0;
    this.playback.setTempo(this.current.from);
    this.tempo = this.playback.tempo;
    this.decide();
  }

  /** Playback has changed: the loop come round, playing begun, a tempo set by hand. */
  private follow(): void {
    const { playback } = this;
    const playing = playback.playing;
    if (playing && !this.wasPlaying) {
      this.rounds = 0;
      this.passes = 0;
    }
    this.wasPlaying = playing;
    if (!this.on) return;
    const rounds = playback.loopRounds;
    if (playback.tempo !== this.tempo) {
      // A step taken, or a tempo set by hand: the passes are counted afresh from it.
      if (playback.tempo === this.planned) this.moves++;
      else this.moves = 0;
      this.tempo = playback.tempo;
      this.passes = 0;
    } else if (rounds > this.rounds) {
      this.passes += rounds - this.rounds;
    }
    this.rounds = rounds;
    this.decide();
  }

  /** The tempo set for the next pass, to tell a step taken from a tempo set by hand. */
  private planned = Number.NaN;

  /** The tempo of the next pass: a step on, once this one ends the passes to be played at this tempo. */
  private decide(): void {
    const { to, step, every, back } = this.current;
    const now = this.playback.tempo;
    const due = now < to - SAME_MOMENT && this.passes + 1 >= every;
    // With steps back: two up, then one back, in turn (a step up past the tempo aimed at stops at it).
    const next = !back ? now + step : this.moves % 2 === 0 ? now + 2 * step : now - step;
    this.planned = due ? Math.min(to, hundredth(next)) : Number.NaN;
    this.playback.setTempoAtLoop(due ? this.planned : null);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
