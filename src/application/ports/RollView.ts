import type { Hand } from '../../domain/note';
import type { PedalEvent, PedalKind } from '../../domain/pedal';
import type { Score, TimeRange } from '../../domain/score';

/** A move of one of the three pedals. */
export interface PedalMove extends PedalEvent {
  readonly pedal: PedalKind;
}

export interface RollFrame {
  readonly score: Score;
  readonly position: number;
  /** The camera only returns to following the music while it is playing. */
  readonly playing: boolean;
  readonly loop: TimeRange | null;
  readonly isHandEnabled: (hand: Hand) => boolean;
  /** Whether the score's pedal is played; when it is not, the pedal marks are dimmed. */
  readonly pedalEnabled: boolean;
  /** How to label a key on screen; the UI supplies it in the current language. */
  readonly noteLabel: (midi: number) => string;
  /** How to label a pedal move ("Pedal ↓"), in the current language. */
  readonly pedalLabel: (move: PedalMove) => string;
}

/** The roll's colors as plain values: the UI resolves the theme's colors and passes them in. */
export interface RollColors {
  readonly background: string;
  readonly barLine: string;
  readonly barNumber: string;
  readonly loop: string;
  readonly nowLine: string;
  readonly whiteKey: string;
  readonly blackKey: string;
  readonly keyBorder: string;
  readonly keyLabel: string;
  readonly pedal: string;
  /** Where the music is, when the notes are dragged elsewhere. */
  readonly cursor: string;
  readonly hand: Readonly<Record<Hand, string>>;
}

/**
 * The music as notes falling onto a keyboard. The UI gives it a frame to draw many times a second
 * and asks it what moment of the music the pointer is at; how it draws is its own business.
 */
export interface RollView {
  setColors(colors: RollColors): void;
  /**
   * The moment of the music at height `clientY` over the falling notes (a note's own start when
   * the pointer is on or just beside its bottom), or null over the keyboard.
   */
  timeAt(clientY: number): number | null;
  /** How many seconds of music one pixel of height stands for, as last drawn (for dragging the notes). */
  readonly secondsPerPixel: number | null;
  /** True when the keyboard is wider than the screen and can be scrolled. */
  readonly scrollable: boolean;
  /** Scrolls the keyboard sideways by hand. */
  scrollBy(dx: number): void;
  /** Call when the view's size on screen changes. */
  resize(): void;
  render(frame: RollFrame): void;
  /** Drags the notes up or down by `seconds` of music (down: later music comes into view); the music plays on. */
  browseBy(seconds: number): void;
  /** Back to following the music at once (after a jump). */
  followMusic(): void;
}
