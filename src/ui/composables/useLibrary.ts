import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';
import type { ShelvedPiece } from '../../application/ports/PieceShelf';
import type { Library } from '../../application/use-cases/Library';

/** Reactive mirror of the library: the pieces on the shelf, and the one that is open. */
export function useLibrary(library: Library): Readonly<ShallowRef<{ readonly pieces: readonly ShelvedPiece[]; readonly current: string | null }>> {
  const snapshot = () => ({ pieces: library.pieces, current: library.current });
  const state = shallowRef(snapshot());
  onScopeDispose(library.onChange(() => (state.value = snapshot())));
  return state;
}
