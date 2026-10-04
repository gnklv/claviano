/** Something that can make piano sound on a shared clock. Times are in the output's own seconds. */
export interface AudioOutput {
  now(): number;
  /** Must be called from a user gesture before the first sound (browser autoplay policy). */
  resume(): Promise<void>;
  /**
   * `soft`: struck with the soft (una corda) pedal down, a duller tone (loudness is in `velocity`).
   * `held`: how long the key itself stays down, when the pedal keeps the note sounding longer
   * than that (the default: for all of `duration`; 0: the key is up already).
   */
  playNote(pitch: number, velocity: number, at: number, duration: number, soft?: boolean, held?: number): void;
  /** The sustain pedal going down or coming up: the noise of its mechanism, if the output has one. */
  playPedal(at: number, down: boolean): void;
  /** A metronome click; `accent` for the first beat of a bar. */
  playClick(at: number, accent: boolean): void;
  /** Silences sounding notes and clicks, and cancels every one scheduled for the future. */
  stopAll(): void;
}
