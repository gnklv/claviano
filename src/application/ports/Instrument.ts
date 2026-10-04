/** Whether the instrument's own sound is in: until then (or if it never loads) a simpler sound plays. */
export type InstrumentStatus = 'loading' | 'ready' | 'unavailable';

/** An instrument whose sound arrives over the network, the notes that are needed first. */
export interface Instrument {
  /** Off: the simpler sound plays, and nothing is fetched. */
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  readonly status: InstrumentStatus;
  /** Called when `enabled` or `status` changes. */
  onChange(listener: () => void): () => void;
  /** The pitches about to be played (a piece's notes): their sound is fetched first. */
  prefer(pitches: Iterable<number>): void;
}
