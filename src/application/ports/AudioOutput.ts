/** Something that can make piano sound on a shared clock. Times are in the output's own seconds. */
export interface AudioOutput {
  now(): number;
  /** Must be called from a user gesture before the first sound (browser autoplay policy). */
  resume(): Promise<void>;
  /** `soft`: struck with the soft (una corda) pedal down, a duller tone (loudness is in `velocity`). */
  playNote(pitch: number, velocity: number, at: number, duration: number, soft?: boolean): void;
  /** Silences sounding notes and cancels every note scheduled for the future. */
  stopAll(): void;
}
