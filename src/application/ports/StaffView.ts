import type { Hand } from '../../domain/note';
import type { Score, TimeRange } from '../../domain/score';

/**
 * The music as printed notes on a grand staff, scrolling under a cursor. The UI tells it what to
 * show and asks it where the pointer is on the page; how it draws is its own business.
 */
export interface StaffView {
  setScore(score: Score | null): void;
  /** Hand marks for notes written on the other hand's staff ("L.H." / "л. р."), in the UI language. */
  setHandLabels(labels: Record<Hand, string>): void;
  setLoop(loop: TimeRange | null): void;
  /**
   * The place on the page under the pointer: the printed bar, and the beat there (a note's own
   * beat when the pointer is just beside it). Null outside the music.
   */
  pageAt(clientX: number): { bar: number; beat: number } | null;
  /** Lightly shades the printed bar under the pointer (null: none). */
  setHover(bar: number | null): void;
  /** Shades printed bars `from..to` while they are being dragged over (null: none). */
  setSelection(selection: { from: number; to: number } | null): void;
  /** Call when the container's size changes. */
  resize(): void;
  /** Called every frame, with the music's position in seconds. Chords of muted hands are not highlighted. */
  render(position: number, isHandEnabled?: (hand: Hand) => boolean, playing?: boolean): void;
  /** Moves the music by `dx` pixels by hand (to the right: back in the music); the music plays on. */
  dragBy(dx: number): void;
  /** Back to following the music (after a jump). */
  followMusic(): void;
}
