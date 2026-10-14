import type { AudioOutput } from '../ports/AudioOutput';
import type { Ticker } from '../ports/Ticker';

/**
 * How far ahead of the output's clock sound is handed to it, in seconds. The ticker is not exact
 * (a timer of the page), the output's clock is: what is handed out this far ahead sounds on time
 * however late the next tick comes. No further than it takes: what is handed out sounds, whatever
 * is stopped meanwhile.
 */
export const AHEAD = 0.2;

/**
 * The one way sound is handed to the output ahead of time, for the music played (Playback) and for
 * the metronome a take is recorded to (Recorder): at once, and at every tick of `ticker`, `hand`
 * is told the moment on the output's clock up to which to hand out what is due. Returns the stop.
 */
export function handAhead(ticker: Ticker, audio: AudioOutput, hand: (until: number) => void): () => void {
  const step = () => hand(audio.now() + AHEAD);
  step();
  return ticker.start(step);
}
