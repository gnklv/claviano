/*
 * A thing drawn along by hand goes on moving when it is let go, and slows to rest: the staff, the
 * falling notes, a keyboard wider than the screen. As a list does on an iPhone, by the same
 * numbers, so that the hand finds what it is used to.
 *
 * Nothing here knows what is moved, or the browser: `Glide` is told how to move it, what time it
 * is and how to ask for the next frame. Lengths are in pixels, times in milliseconds.
 */

/**
 * Each millisecond the speed is this share of what it was a millisecond before: an iPhone's own
 * number for a list let go (UIScrollView.DecelerationRate.normal).
 */
export const DECELERATION = 0.998;
const SLOWING = Math.log(DECELERATION);
/** Slower than this (a pixel in a twentieth of a second) is at rest: the eye sees no more movement. */
const AT_REST = 0.02;

/** How far a thing let go at `speed` has gone after `time`. */
export const glided = (speed: number, time: number): number => (speed * (DECELERATION ** time - 1)) / SLOWING;

/** For how long a thing let go at `speed` goes on before it is at rest. */
export const glideTime = (speed: number): number => (Math.abs(speed) <= AT_REST ? 0 : Math.log(AT_REST / Math.abs(speed)) / SLOWING);

/** The speed of a hand is that of its last tenth of a second: what it did before is forgotten. */
const HAND_WINDOW = 100;
/** A hand that has not moved for this long before letting go has stopped: it lets go at rest. */
const HAND_STOPPED = 60;

/** The speed of the hand that draws, from where it has just been. */
export class HandSpeed {
  private places: { at: number; place: number }[] = [];

  /** The hand is at `place` now. */
  mark(place: number, now: number): void {
    this.places.push({ at: now, place });
    while (this.places.length > 2 && now - this.places[0]!.at > HAND_WINDOW) this.places.shift();
  }

  /** Its speed at letting go, now; nothing is kept of it afterwards. */
  letGo(now: number): number {
    const places = this.places.filter(({ at }) => now - at <= HAND_WINDOW);
    this.places = [];
    const first = places[0];
    const last = places.at(-1);
    if (!first || !last || last.at === first.at || now - last.at > HAND_STOPPED) return 0;
    return (last.place - first.place) / (last.at - first.at);
  }
}

/** A hand slower than this lets go at rest: a thing set down, not thrown. */
const THROWN = 0.05;
/**
 * A hand that catches a gliding thing and throws it on the same way, at this speed or faster, adds
 * its throw to the glide it caught: how a long piece is leafed through. (Slower, it has taken hold.)
 */
const THROWN_ON = 0.5;
/** No faster than this, whatever the hand did (a slip of a finger, a jump of the pointer). */
const FASTEST = 8;

export interface GlideHost {
  /** The time now, in milliseconds. */
  now(): number;
  /** Asks for `step` to be called at the next frame; returns what takes the asking back. */
  nextFrame(step: () => void): () => void;
  /** Nothing is to glide (a person has asked their system for less motion). */
  still(): boolean;
}

/**
 * One thing that glides, along one line. `move` moves it by so many pixels and says by how many it
 * could (less, at an end of what there is: the glide ends there, as against a wall).
 */
export class Glide {
  private readonly hand = new HandSpeed();
  private gliding: { speed: number; since: number; gone: number; forget: () => void } | null = null;
  /** The speed of the glide the hand has just caught. */
  private caught = 0;

  constructor(
    private readonly move: (by: number) => number,
    private readonly host: GlideHost,
  ) {}

  /** The hand takes hold, at `place` along the line: what was gliding stops under it. */
  hold(place: number): void {
    const now = this.host.now();
    this.caught = this.gliding ? this.gliding.speed * DECELERATION ** (now - this.gliding.since) : 0;
    this.rest();
    this.hand.letGo(now);
    this.hand.mark(place, now);
  }

  /** The hand, holding, is at `place` now. (Moving the thing along with it is its owner's to do.) */
  follow(place: number): void {
    this.hand.mark(place, this.host.now());
  }

  /** The hand lets go: the thing goes on as it was going. */
  letGo(): void {
    const now = this.host.now();
    let speed = this.hand.letGo(now);
    if (Math.abs(speed) >= THROWN_ON && Math.sign(speed) === Math.sign(this.caught)) speed += this.caught;
    this.caught = 0;
    if (this.host.still() || Math.abs(speed) < THROWN) return;
    speed = Math.sign(speed) * Math.min(Math.abs(speed), FASTEST);
    this.gliding = { speed, since: now, gone: 0, forget: this.host.nextFrame(() => this.step()) };
  }

  /** At rest, at once (the hand let go of nothing; the thing is gone). */
  rest(): void {
    this.gliding?.forget();
    this.gliding = null;
  }

  get moving(): boolean {
    return this.gliding !== null;
  }

  private step(): void {
    const gliding = this.gliding;
    if (!gliding) return;
    const time = this.host.now() - gliding.since;
    const over = time >= glideTime(gliding.speed);
    const to = glided(gliding.speed, over ? glideTime(gliding.speed) : time);
    const by = to - gliding.gone;
    gliding.gone = to;
    const moved = this.move(by);
    // (Half a pixel short is the arithmetic's; more is an end of what there is.)
    if (over || Math.abs(moved - by) > 0.5) this.gliding = null;
    else gliding.forget = this.host.nextFrame(() => this.step());
  }
}
