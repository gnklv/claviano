import type { ShallowRef } from 'vue';
import type { Playback } from '../../application/use-cases/Playback';
import type { Hand } from '../../domain/note';
import type { Score, TimeRange } from '../../domain/score';
import { useMirror } from './useMirror';

export interface PlaybackSnapshot {
  readonly score: Score | null;
  readonly playing: boolean;
  readonly tempo: number;
  readonly loop: TimeRange | null;
  readonly hands: Readonly<Record<Hand, boolean>>;
  readonly pedal: boolean;
  readonly metronome: boolean;
  readonly countIn: boolean;
}

const snapshot = (playback: Playback): PlaybackSnapshot => ({
  score: playback.score,
  playing: playback.playing,
  tempo: playback.tempo,
  loop: playback.loop,
  hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
  pedal: playback.pedalEnabled,
  metronome: playback.metronomeEnabled,
  countIn: playback.countInEnabled,
});

/**
 * Reactive mirror of Playback's discrete state (play/pause, tempo, loop, hands, pedal, metronome, score).
 * The continuously changing position is deliberately not here: read it per frame instead.
 */
export function usePlaybackState(playback: Playback): Readonly<ShallowRef<PlaybackSnapshot>> {
  return useMirror(playback, () => snapshot(playback));
}
