import type { ShallowRef } from 'vue';
import type { PieceMemory, ShelvedPiece } from '../../application/ports/PieceShelf';
import type { Library } from '../../application/use-cases/Library';
import { useMirror } from './useMirror';

export interface LibrarySnapshot {
  readonly pieces: readonly ShelvedPiece[];
  readonly current: string | null;
  /** False where the browser gives no storage: nothing is kept between visits. */
  readonly keeps: boolean;
  /** How a piece was left (as the library has it now). */
  readonly memory: (id: string) => PieceMemory | null;
}

/** Reactive mirror of the library: the pieces on the shelf, how each was left, and the one that is open. */
export function useLibrary(library: Library): Readonly<ShallowRef<LibrarySnapshot>> {
  const snapshot = (): LibrarySnapshot => ({ pieces: library.pieces, current: library.current, keeps: library.keeps, memory: (id) => library.memory(id) });
  return useMirror(library, snapshot);
}
