import { onScopeDispose, shallowRef } from 'vue';
import type { Playback } from '../../application/use-cases/Playback';
import type { Hand } from '../../domain/note';
import type { Score, TimeRange } from '../../domain/score';

export interface PlaybackSnapshot {
  readonly score: Score | null;
  readonly playing: boolean;
  readonly tempo: number;
  readonly loop: TimeRange | null;
  readonly hands: Readonly<Record<Hand, boolean>>;
  readonly pedal: boolean;
}

const snapshot = (playback: Playback): PlaybackSnapshot => ({
  score: playback.score,
  playing: playback.playing,
  tempo: playback.tempo,
  loop: playback.loop,
  hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
  pedal: playback.pedalEnabled,
});

/**
 * Reactive mirror of Playback's discrete state (play/pause, tempo, loop, hands, pedal, score).
 * A shallowRef keeps Vue from deep-proxying the score's notes.
 * The continuously changing position is deliberately not here: read it per frame instead.
 */
export function usePlaybackState(playback: Playback) {
  const state = shallowRef(snapshot(playback));
  const unsubscribe = playback.onChange(() => (state.value = snapshot(playback)));
  onScopeDispose(unsubscribe);
  return state;
}
