import type { PieceShelf, ShelvedPiece } from '../../application/ports/PieceShelf';

/*
 * The shelf in the browser's own database (IndexedDB): it holds files as they are, in any number
 * a sheet-music shelf will ever have. Two stores: what is known of each piece (read whole to show
 * the shelf), and the files (read one at a time, when a piece is opened).
 */
const PIECES = 'pieces';
const FILES = 'files';

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const finished = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });

export class IndexedDbPieceShelf implements PieceShelf {
  private database: Promise<IDBDatabase> | null = null;

  constructor(private readonly name = 'claviano') {}

  async list(): Promise<ShelvedPiece[]> {
    const db = await this.open();
    return done(db.transaction(PIECES).objectStore(PIECES).getAll() as IDBRequest<ShelvedPiece[]>);
  }

  async file(id: string): Promise<ArrayBuffer | null> {
    const db = await this.open();
    return (await done(db.transaction(FILES).objectStore(FILES).get(id) as IDBRequest<ArrayBuffer | undefined>)) ?? null;
  }

  async save(piece: ShelvedPiece, data?: ArrayBuffer): Promise<void> {
    const db = await this.open();
    // (Both in one transaction: a piece is never on the shelf without its file.)
    const transaction = db.transaction([PIECES, FILES], 'readwrite');
    transaction.objectStore(PIECES).put(piece);
    if (data) transaction.objectStore(FILES).put(data, piece.id);
    await finished(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(PIECES, { keyPath: 'id' });
        request.result.createObjectStore(FILES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available'));
    });
    // (A failure is not kept: the next call tries again.)
    this.database.catch(() => (this.database = null));
    return this.database;
  }
}
