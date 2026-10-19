import type { ShallowRef } from 'vue';
import type { Meter, Recorder, RecorderState } from '../../application/use-cases/Recorder';
import { useMirror } from './useMirror';

export interface RecorderSnapshot {
  readonly state: RecorderState;
  readonly tempo: number;
  readonly meter: Meter;
  readonly metronome: boolean;
  /** The take is being played back. */
  readonly listening: boolean;
  /** How many notes the take has, and how many of them have ended (their keys are up). */
  readonly notes: number;
  readonly ends: number;
}

/** Reactive mirror of the recorder: its state and settings. (The take itself is read as it is drawn.) */
export function useRecorder(recorder: Recorder): Readonly<ShallowRef<RecorderSnapshot>> {
  const snapshot = (): RecorderSnapshot => ({
    state: recorder.state,
    tempo: recorder.tempo,
    meter: recorder.meter,
    metronome: recorder.metronome,
    listening: recorder.listening,
    notes: recorder.take?.notes.length ?? 0,
    ends: recorder.take?.notes.filter((note) => note.end !== null).length ?? 0,
  });
  return useMirror(recorder, snapshot);
}
