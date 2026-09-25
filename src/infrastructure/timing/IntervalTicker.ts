import type { Ticker } from '../../application/ports/Ticker';

/** setInterval keeps running in background tabs (throttled), unlike requestAnimationFrame. */
export class IntervalTicker implements Ticker {
  constructor(private readonly intervalMs = 25) {}

  start(onTick: () => void): () => void {
    const id = setInterval(onTick, this.intervalMs);
    return () => clearInterval(id);
  }
}
