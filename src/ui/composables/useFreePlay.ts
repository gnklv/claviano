import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';
import type { FreePlay } from '../../application/use-cases/FreePlay';

export interface FreePlaySnapshot {
  readonly lowest: number;
  readonly keys: number;
  readonly pressed: ReadonlySet<number>;
  readonly canGoLower: boolean;
  readonly canGoHigher: boolean;
}

/** Reactive mirror of free play: the keyboard shown and the keys held. */
export function useFreePlay(freePlay: FreePlay): Readonly<ShallowRef<FreePlaySnapshot>> {
  const snapshot = (): FreePlaySnapshot => ({
    lowest: freePlay.lowest,
    keys: freePlay.keys,
    pressed: freePlay.pressed,
    canGoLower: freePlay.canGoLower,
    canGoHigher: freePlay.canGoHigher,
  });
  const state = shallowRef(snapshot());
  onScopeDispose(freePlay.onChange(() => (state.value = snapshot())));
  return state;
}
