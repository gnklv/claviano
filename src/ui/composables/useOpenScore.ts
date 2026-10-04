import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';
import type { DemoPiece, OpenFailure, OpenScore } from '../../application/use-cases/OpenScore';

/** Reactive mirror of what is open: the demo (if it is one) and the last failure. */
export function useOpenScore(openScore: OpenScore): Readonly<ShallowRef<{ readonly demo: DemoPiece | null; readonly failure: OpenFailure | null }>> {
  const snapshot = () => ({ demo: openScore.demo, failure: openScore.failure });
  const state = shallowRef(snapshot());
  onScopeDispose(openScore.onChange(() => (state.value = snapshot())));
  return state;
}
