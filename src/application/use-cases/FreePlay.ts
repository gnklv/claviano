import { HIGHEST_KEY, LOWEST_KEY } from '../../domain/pitch';
import type { AudioOutput } from '../ports/AudioOutput';

/** How hard a key is struck where nothing tells (a screen has no way to). */
export const STRIKE = 0.75;
/** The keyboard starts at this Do, and moves by octaves between the lowest and the highest on a piano. */
const FIRST_DO = 48;
const LOWEST_DO = 24;
const HIGHEST_DO = 96;

/**
 * Playing by hand: keys pressed and let go, sounding as they are held. Where the keys come from
 * (the screen, the computer's keyboard; later a microphone, a MIDI keyboard) is nothing to it.
 *
 * The keyboard shown is a stretch of the piano's, `keys` wide from `lowest` (a Do), moved by
 * octaves. (Keeping the instrument ready for it is PrepareInstrument's, which asks whether free
 * play is entered.)
 */
export class FreePlay {
  private readonly held = new Map<number, () => void>();
  private first = FIRST_DO;
  private width = 25;
  private on = false;
  private readonly listeners = new Set<() => void>();
  private readonly keyListeners = new Set<(pitch: number, down: boolean, at: number) => void>();

  constructor(private readonly audio: AudioOutput) {}

  /** Free play is on the screen: its keys are what the instrument is to be ready for. */
  get entered(): boolean {
    return this.on;
  }

  /** The lowest key shown: a Do. */
  get lowest(): number {
    return this.first;
  }

  /** How many keys are shown, white and black. */
  get keys(): number {
    return this.width;
  }

  /** The keys held now. */
  get pressed(): ReadonlySet<number> {
    return new Set(this.held.keys());
  }

  get canGoLower(): boolean {
    return this.first > LOWEST_DO;
  }

  get canGoHigher(): boolean {
    return this.first < HIGHEST_DO && this.first + 12 + this.width - 1 <= HIGHEST_KEY;
  }

  /** Called when keys are pressed or let go, the keyboard moves, or free play is entered or left. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called as each key goes down and comes up, with when on the output's clock: for whoever writes the playing down. */
  onKey(listener: (pitch: number, down: boolean, at: number) => void): () => void {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }

  /** The output's clock, in seconds: what the times of keys are told by. */
  now(): number {
    return this.audio.now();
  }

  /** Coming to play. */
  enter(): void {
    this.on = true;
    this.emit();
  }

  /** Leaving: every key comes up. */
  leave(): void {
    this.on = false;
    this.releaseAll();
    this.emit();
  }

  /** How many keys there is room for (the screen's width tells). */
  setKeys(keys: number): void {
    if (keys === this.width) return;
    this.width = keys;
    this.fit();
    this.changed();
  }

  /** Moves the keyboard an octave down (-1) or up (1), within the piano's. */
  shift(octaves: -1 | 1): void {
    if (octaves < 0 ? !this.canGoLower : !this.canGoHigher) return;
    this.releaseAll();
    this.first += 12 * octaves;
    this.changed();
  }

  /** A key goes down, and sounds until it comes up. (A key that is down already, or not on a piano, does nothing.) */
  press(pitch: number): void {
    if (this.held.has(pitch) || pitch < LOWEST_KEY || pitch > HIGHEST_KEY) return;
    // (The first sound of a visit has to come from a press: browsers keep a page silent until then.)
    void this.audio.resume();
    this.held.set(pitch, this.audio.strike(pitch, STRIKE));
    this.tell(pitch, true);
    this.emit();
  }

  release(pitch: number): void {
    const letGo = this.held.get(pitch);
    if (!letGo) return;
    this.held.delete(pitch);
    letGo();
    this.tell(pitch, false);
    this.emit();
  }

  releaseAll(): void {
    if (this.held.size === 0) return;
    const pitches = [...this.held.keys()];
    for (const letGo of this.held.values()) letGo();
    this.held.clear();
    for (const pitch of pitches) this.tell(pitch, false);
    this.emit();
  }

  /** The keyboard, however wide, stays on the piano. */
  private fit(): void {
    while (this.first > LOWEST_DO && this.first + this.width - 1 > HIGHEST_KEY) this.first -= 12;
  }

  private changed(): void {
    this.emit();
  }

  private tell(pitch: number, down: boolean): void {
    const at = this.audio.now();
    for (const listener of this.keyListeners) listener(pitch, down, at);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
