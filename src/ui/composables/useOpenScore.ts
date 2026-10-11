import type { ShallowRef } from 'vue';
import type { DemoPiece, OpenFailure, OpenScore } from '../../application/use-cases/OpenScore';
import { useMirror } from './useMirror';

/** Reactive mirror of what is open: the demo (if it is one) and the last failure. */
export function useOpenScore(openScore: OpenScore): Readonly<ShallowRef<{ readonly demo: DemoPiece | null; readonly failure: OpenFailure | null }>> {
  return useMirror(openScore, () => ({ demo: openScore.demo, failure: openScore.failure }));
}
