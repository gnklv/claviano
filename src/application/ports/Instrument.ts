/** Whether the instrument's own sound is in: until then (or if it never loads) a simpler sound plays. */
export type InstrumentStatus = 'loading' | 'ready' | 'unavailable';

/** An instrument whose sound arrives over the network, the notes that are needed first. */
export interface Instrument {
  readonly status: InstrumentStatus;
  onStatusChange(listener: () => void): () => void;
  /** The pitches about to be played (a piece's notes): their sound is fetched first. */
  prefer(pitches: Iterable<number>): void;
}
