import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';

/** Something that tells when it has changed: a use case. */
interface Changing {
  onChange(listener: () => void): () => void;
}

/**
 * A use case mirrored into a component: `snapshot` is what the component needs of it, taken now
 * and again each time the use case says it has changed. The one way a use case's state reaches a
 * template (see docs/rules.md).
 *
 * A shallowRef: what is mirrored is replaced whole, and nothing inside it is made reactive (a
 * score's notes are many, and never change in place).
 */
export function useMirror<T>(source: Changing, snapshot: () => T): Readonly<ShallowRef<T>> {
  const state = shallowRef(snapshot());
  onScopeDispose(source.onChange(() => (state.value = snapshot())));
  return state;
}
