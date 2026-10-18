/*
 * What is drawn follows the music: the staff's tape, the falling notes, the keyboard under them.
 * Each can be moved away by hand; then it stays where it was put while the music plays on for a
 * while, and goes back to the music after it, or at once when the music is sent elsewhere (a click,
 * the arrows). What it is held at, and how it goes back, is each one's own; when it lets go is this.
 */

/** Moved away by hand, a view stays put for this long of playing time before it goes back to the music. */
export const HOLD_SECONDS = 3;
/** The music moved further than this between two frames, in seconds: it was sent there, not played there. */
const SEEK_SECONDS = 0.5;

/** Tells the music sent elsewhere from the music playing on, frame by frame. */
export class SeekWatch {
  private last = 0;

  /** Where the music was at the last frame. */
  get position(): number {
    return this.last;
  }

  /** The music is at `position` now: whether it was sent there since the last frame. */
  seeked(position: number): boolean {
    const seeked = Math.abs(position - this.last) > SEEK_SECONDS;
    this.last = position;
    return seeked;
  }
}

/** Where a view was moved to by hand, held there until it is let go (see HOLD_SECONDS). */
export class HandHold<T> {
  private held: { value: T; idle: number } | null = null;

  /** What is held, or null while the view follows the music. */
  get value(): T | null {
    return this.held?.value ?? null;
  }

  /** Moved by hand to `value`: held there afresh. */
  hold(value: T): void {
    this.held = { value, idle: 0 };
  }

  /** Let go at once. */
  release(): void {
    this.held = null;
  }

  /**
   * A frame `dt` seconds after the last: the time held counts only while the music plays. Returns
   * what was held if it is let go now (the time is up, or the music was sent elsewhere), else null.
   */
  pass(dt: number, playing: boolean, seeked: boolean): T | null {
    const held = this.held;
    if (!held) return null;
    if (playing) held.idle += dt;
    if (!seeked && held.idle < HOLD_SECONDS) return null;
    this.held = null;
    return held.value;
  }
}

/**
 * Moves `current` toward `target` smoothly: fast at first, slowing down as it arrives.
 * Frame-rate independent, so it looks the same at 60 and 120 fps.
 */
export function approach(current: number, target: number, dtSeconds: number, timeConstant = 0.2): number {
  const next = current + (target - current) * (1 - Math.exp(-dtSeconds / timeConstant));
  return Math.abs(target - next) < 0.5 ? target : next;
}
