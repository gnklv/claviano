import type { WarmupSession } from '../../application/use-cases/WarmupSession';
import { useMirror } from './useMirror';

export function useWarmupState(session: WarmupSession) {
  return useMirror(session, () => ({
    status: session.status,
    selection: session.selection,
    steps: session.steps,
    current: session.current,
    step: session.step,
  }));
}
