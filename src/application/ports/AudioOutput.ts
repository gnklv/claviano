/** One note to sound. Times are in the output's own seconds. */
export interface NoteToPlay {
  readonly pitch: number;
  /** How hard it is struck, 0 to 1. */
  readonly velocity: number;
  /** When it starts, and for how long it sounds. */
  readonly at: number;
  readonly duration: number;
  /** Struck with the soft (una corda) pedal down: a duller tone (loudness is in `velocity`). */
  readonly soft: boolean;
  /**
   * How long the key itself stays down: `duration`, or less when the pedal keeps the note
   * sounding after the key is up (0: the key is up already).
   */
  readonly held: number;
}

/** What is heard: the notes (with the instrument's own noises), and the metronome's clicks. */
export type SoundPart = 'instrument' | 'metronome';

/** Something that can make piano sound on a shared clock. Times are in the output's own seconds. */
export interface AudioOutput {
  now(): number;
  /** Must be called from a user gesture before the first sound (browser autoplay policy). */
  resume(): Promise<void>;
  playNote(note: NoteToPlay): void;
  /** The sustain pedal going down or coming up: the noise of its mechanism, if the output has one. */
  playPedal(at: number, down: boolean): void;
  /** A metronome click; `accent` for the first beat of a bar. */
  playClick(at: number, accent: boolean): void;
  /** How loud a part is, from 0 (silent) to 1 (as loud as it is made); what sounds already follows. */
  setVolume(part: SoundPart, volume: number): void;
  /** Silences sounding notes and clicks, and cancels every one scheduled for the future. */
  stopAll(): void;
}
