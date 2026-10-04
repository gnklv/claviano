import { computed, onScopeDispose, shallowRef, type ComputedRef, type WritableComputedRef } from 'vue';
import type { BarLoop } from '../../application/use-cases/BarLoop';

/** Reactive mirror of the bar loop's state, for templates: whether it is on (writable) and its bars. */
export function useBarLoop(loop: BarLoop): {
  readonly enabled: WritableComputedRef<boolean>;
  readonly from: ComputedRef<number>;
  readonly to: ComputedRef<number>;
} {
  const snapshot = () => ({ enabled: loop.enabled, from: loop.from, to: loop.to });
  const state = shallowRef(snapshot());
  onScopeDispose(loop.onChange(() => (state.value = snapshot())));
  return {
    enabled: computed({ get: () => state.value.enabled, set: (enabled) => loop.setEnabled(enabled) }),
    from: computed(() => state.value.from),
    to: computed(() => state.value.to),
  };
}
