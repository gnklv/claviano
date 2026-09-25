/** Calls back periodically so playback can schedule upcoming notes. Returns a stop function. */
export interface Ticker {
  start(onTick: () => void): () => void;
}
