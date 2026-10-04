import { barIndexNear, barRange, type Score } from '../../domain/score';
import type { Playback } from './Playback';

/**
 * The bar loop: playing printed bars `from..to` over and over, set from the loop fields or by
 * selecting bars on the staff.
 *
 * With repeats a printed bar is played more than once; the loop takes the passes nearest to where
 * the choice was made, so looping inside the second pass stays in the second pass.
 */
export class BarLoop {
  private on = false;
  private fromBar = 1;
  private toBar = 4;
  /** Where the passes were chosen, in seconds; null: near where playback is. */
  private near: number | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly playback: Playback) {
    // A new score starts without a loop (playback has dropped it already).
    let score: Score | null = playback.score;
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      this.near = null;
      if (!this.on) return;
      this.on = false;
      this.emit();
    });
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Printed bar numbers, as in the loop fields. */
  get from(): number {
    return this.fromBar;
  }

  get to(): number {
    return this.toBar;
  }

  /** Called when the loop is switched on or off, or its bars change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.on) return;
    this.on = enabled;
    this.changed();
  }

  /** The loop fields, typed in by hand: passes are then taken near where playback is. */
  setFrom(bar: number): void {
    this.near = null;
    if (bar === this.fromBar) return;
    this.fromBar = bar;
    this.changed();
  }

  setTo(bar: number): void {
    this.near = null;
    if (bar === this.toBar) return;
    this.toBar = bar;
    this.changed();
  }

  /** Loops printed bars `from..to` (either way round), taking the passes (with repeats) nearest to `near` seconds. */
  select(from: number, to: number, near: number): void {
    this.near = near;
    this.fromBar = Math.min(from, to);
    this.toBar = Math.max(from, to);
    this.on = true;
    this.changed();
  }

  /** Moves playback to `time`; a jump out of the loop switches the loop off. */
  jumpTo(time: number): void {
    const loop = this.playback.loop;
    if (loop && (time < loop.start || time >= loop.end)) {
      this.on = false;
      this.playback.setLoop(null);
      this.emit();
    }
    this.playback.seek(time);
  }

  private changed(): void {
    this.apply();
    this.emit();
  }

  private apply(): void {
    const score = this.playback.score;
    if (!score) return;
    const around = this.near ?? this.playback.position;
    this.playback.setLoop(this.on ? barRange(score, barIndexNear(score, this.fromBar, around), barIndexNear(score, this.toBar, around)) : null);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
