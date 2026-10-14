import type { ShallowRef } from 'vue';
import type { ShelvedPiece } from '../../application/ports/PieceShelf';
import type { Library } from '../../application/use-cases/Library';
import { useMirror } from './useMirror';

export interface LibrarySnapshot {
  readonly pieces: readonly ShelvedPiece[];
  readonly current: string | null;
  /** False where the browser gives no storage: nothing is kept between visits. */
  readonly keeps: boolean;
}

/** Reactive mirror of the library: the pieces on the shelf, and the one that is open. */
export function useLibrary(library: Library): Readonly<ShallowRef<LibrarySnapshot>> {
  const snapshot = (): LibrarySnapshot => ({ pieces: library.pieces, current: library.current, keeps: library.keeps });
  return useMirror(library, snapshot);
}
