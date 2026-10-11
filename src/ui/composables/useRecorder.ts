import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';
import type { Meter, Recorder, RecorderState } from '../../application/use-cases/Recorder';

export interface RecorderSnapshot {
  readonly state: RecorderState;
  readonly tempo: number;
  readonly meter: Meter;
  readonly metronome: boolean;
  /** How many notes the take has. */
  readonly notes: number;
}

/** Reactive mirror of the recorder: its state and settings. (The take itself is read as it is drawn.) */
export function useRecorder(recorder: Recorder): Readonly<ShallowRef<RecorderSnapshot>> {
  const snapshot = (): RecorderSnapshot => ({
    state: recorder.state,
    tempo: recorder.tempo,
    meter: recorder.meter,
    metronome: recorder.metronome,
    notes: recorder.take?.notes.length ?? 0,
  });
  const state = shallowRef(snapshot());
  onScopeDispose(recorder.onChange(() => (state.value = snapshot())));
  return state;
}
