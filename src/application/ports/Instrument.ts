/** Whether the instrument's own sound is in: until then (or if it never loads) a simpler sound plays. */
export type InstrumentStatus = 'loading' | 'ready' | 'unavailable';

/** A note the instrument should be ready to play: how hard it is struck (0–1) and the longest it may sound, in seconds. */
export interface NoteToPrepare {
  readonly pitch: number;
  readonly velocity: number;
  readonly seconds: number;
}

/**
 * An instrument whose sound arrives over the network and takes memory once it is in: it readies
 * what the notes about to be played need, and no more.
 */
export interface Instrument {
  /** Off: the simpler sound plays, and nothing is fetched. */
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  readonly status: InstrumentStatus;
  /** Called when `enabled` or `status` changes. */
  onChange(listener: () => void): () => void;
  /** The notes about to be played (a piece's notes, at the tempo it is played at). */
  prepare(notes: readonly NoteToPrepare[]): void;
}
