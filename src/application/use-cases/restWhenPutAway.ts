import type { Playback } from './Playback';
import type { Recorder } from './Recorder';

/**
 * What sounds comes to rest when the page is put away: another tab, the window out of sight, the
 * app left on a phone. Returns what is to be called then.
 *
 * Nobody practises with the notes out of sight; and a page out of sight cannot keep time anyway (a
 * browser lets it wake once a second, a phone not at all: of the music only what fell just after a
 * waking was heard). The piece is paused, to be gone on with from the same place; a take being
 * recorded is ended, and kept as far as it got; a take being listened to stops.
 */
export function restWhenPutAway(playback: Playback, recorder: Recorder): () => void {
  return () => {
    playback.pause();
    recorder.stop();
    recorder.stopListening();
  };
}
