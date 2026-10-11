import type { PieceMemory, PieceShelf, ShelvedPiece } from '../../application/ports/PieceShelf';

/*
 * The shelf in the browser's own database (IndexedDB): it holds files as they are, in any number
 * a sheet-music shelf will ever have. Two stores: what is known of each piece (read whole to show
 * the shelf), and the files (read one at a time, when a piece is opened). A third: how each piece
 * was left, by its id (written often, and for demos too, which have no file here).
 */
const PIECES = 'pieces';
const FILES = 'files';
const MEMORIES = 'memories';

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

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([PIECES, FILES, MEMORIES], 'readwrite');
    for (const store of [PIECES, FILES, MEMORIES]) transaction.objectStore(store).delete(id);
    await finished(transaction);
  }

  async memories(): Promise<Record<string, unknown>> {
    const db = await this.open();
    const store = db.transaction(MEMORIES).objectStore(MEMORIES);
    const [ids, memories] = await Promise.all([done(store.getAllKeys()), done(store.getAll() as IDBRequest<unknown[]>)]);
    // (The keys are the pieces' ids: strings, as remember writes them.)
    return Object.fromEntries(ids.flatMap((id, index) => (typeof id === 'string' ? [[id, memories[index]]] : [])));
  }

  async remember(id: string, memory: PieceMemory): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(MEMORIES, 'readwrite');
    transaction.objectStore(MEMORIES).put(memory, id);
    await finished(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      // Version 2 added the memories.
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PIECES)) db.createObjectStore(PIECES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
        if (!db.objectStoreNames.contains(MEMORIES)) db.createObjectStore(MEMORIES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available'));
    });
    // (A failure is not kept: the next call tries again.)
    this.database.catch(() => (this.database = null));
    return this.database;
  }
}
