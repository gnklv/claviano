import { approach, HandHold, SeekWatch } from '../following';

/*
 * Where the staff's tape stands, frame by frame: under the cursor, the music; a leap in the music
 * glided over; the tape dragged away by hand held where it was put. Only arithmetic here, in pixels
 * along the tape; the staff moves what is drawn by what this says.
 */

/**
 * When the tape leaps (back on a repeat, over the room of a key or time change, after a seek or a
 * drag), it glides there rather than jumps: this is the glide's time constant in seconds (about
 * three of them to arrive). Ordinary playback is followed exactly, however fast.
 */
const GLIDE_SECONDS = 0.1;

/** Where the music is, as the staff finds it on its page, for one frame. */
export interface MusicHere {
  /** Where the music is played, in seconds. */
  readonly position: number;
  /** The tape's offset that puts the music under the cursor. */
  readonly target: number;
  /** The printed bar it is in. */
  readonly bar: number;
  /** Whether going from printed bar `previous` on to `bar` steps over room kept at the bar line (a key, a time or a repeat sign). */
  readonly overRoom: (previous: number, bar: number) => boolean;
}

export class TapeMotion {
  /** Where the tape is drawn (it trails the music while gliding to it). */
  private shown = Number.NaN;
  /** How far the tape trails the music while gliding to it; 0 when it follows exactly. */
  private lag = 0;
  /** The printed bar the music was in at the last frame, to tell playing on from a leap. */
  private lastBar = 0;
  private readonly dragged = new HandHold<number>();
  private readonly seeks = new SeekWatch();

  /** Where the music was at the last frame, in seconds. */
  get position(): number {
    return this.seeks.position;
  }

  /** Where the tape was dragged to by hand and is held, or null while it follows the music. */
  get held(): number | null {
    return this.dragged.value;
  }

  /** Where the tape stands for the music at `target`, as it trails or is held now. */
  offset(target: number): number {
    return this.dragged.value ?? target + this.lag;
  }

  /** A frame `dt` seconds after the last: where the tape stands for the music `here`. */
  frame(here: MusicHere, dt: number, playing: boolean): number {
    const { target, bar } = here;
    if (Number.isNaN(this.shown)) this.shown = target;
    // Dragged by hand: the tape stays where it was put; after a while of playing it goes back to
    // the music. A seek (a click, the arrows) goes back at once.
    const seeked = this.seeks.seeked(here.position);
    const letGo = this.dragged.pass(dt, playing, seeked) !== null;
    const held = this.dragged.value;

    // Where the music went on the page since the last frame: to the next printed bar is playing on;
    // anything else (a repeat, a D.S., a seek) is a leap, and so is stepping over the room kept at
    // a bar line.
    const previous = this.lastBar;
    this.lastBar = bar;
    const nextBar = bar === previous + 1;
    const leap = seeked || letGo || (bar !== previous && !nextBar) || (nextBar && here.overRoom(previous, bar));

    if (held !== null) {
      this.shown = held;
      this.lag = 0;
    } else {
      // Follow the music exactly; but on a leap, glide to it. The glide shrinks the distance to the
      // music rather than chasing it: the music keeps moving, and a glide towards a moving target
      // would never quite arrive.
      if (leap) this.lag = this.shown - target;
      this.lag = approach(this.lag, 0, dt, GLIDE_SECONDS);
      this.shown = target + this.lag;
    }
    return this.shown;
  }

  /**
   * Moved by `dx` pixels by hand, from where it stands, within `lowest..highest`. Returns how far it
   * moved. The music plays on; after a while of playing the tape goes back to it.
   */
  dragBy(dx: number, lowest: number, highest: number): number {
    const current = this.dragged.value ?? this.shown;
    const offset = Math.min(highest, Math.max(lowest, current + dx));
    this.dragged.hold(offset);
    return offset - current;
  }

  /** Back to following the music (after a jump): the tape glides to it. */
  follow(): void {
    this.dragged.release();
  }
}
