import type { PieceMemory, PieceShelf } from '../ports/PieceShelf';

/**
 * How each piece was left: its place, tempo, hands and loop, and the bar it was at (see
 * rememberPieces, which writes it down and sets it again). Kept on the shelf between visits; for
 * this visit only where the shelf keeps nothing (a private window).
 */
export class PieceMemories {
  private remembered = new Map<string, PieceMemory>();
  private read = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly shelf: PieceShelf) {}

  /** Whether what was kept has been read from the shelf (or found not to be there). */
  get loaded(): boolean {
    return this.read;
  }

  /** How a piece was left; null for one never opened (or never remembered). */
  memory(id: string): PieceMemory | null {
    return this.remembered.get(id) ?? null;
  }

  /** Called when a piece's memory changes, and once what was kept has been read. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads what was kept: once, when the app starts. */
  async load(): Promise<void> {
    const stored = await this.shelf.memories().catch(() => ({}));
    for (const [id, value] of Object.entries(stored)) {
      const memory = asMemory(value);
      if (memory) this.remembered.set(id, memory);
    }
    this.read = true;
    this.emit();
  }

  /** Keeps how a piece is left. */
  remember(id: string, memory: PieceMemory): void {
    this.remembered.set(id, memory);
    this.emit();
    // (Not kept between visits where there is no shelf; for this visit it is.)
    this.shelf.remember(id, memory).catch(() => {});
  }

  /** Lets go of what is remembered of a piece taken off the shelf (the shelf let go of it with the piece). */
  forget(id: string): void {
    if (this.remembered.delete(id)) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** What was stored as a piece's memory, if it is one: the store may hold an older version's, or anything. */
function asMemory(stored: unknown): PieceMemory | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { position, tempo, hands, loop, bar, bars } = stored as Partial<Record<keyof PieceMemory, unknown>>;
  const numbers = [position, tempo, bar, bars];
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  if (typeof hands !== 'object' || hands === null || typeof loop !== 'object' || loop === null) return null;
  const { right, left } = hands as Record<string, unknown>;
  const { on, from, to } = loop as Record<string, unknown>;
  if (typeof right !== 'boolean' || typeof left !== 'boolean' || typeof on !== 'boolean' || typeof from !== 'number' || typeof to !== 'number') return null;
  // (A trainer or bookmarks that are not such are let go of, and the rest kept.)
  const { trainer, bookmarks, ...rest } = stored as PieceMemory;
  return { ...rest, ...(asTrainer(trainer) ? { trainer } : {}), ...(asBookmarks(bookmarks) ? { bookmarks } : {}) };
}

function asBookmarks(stored: unknown): stored is PieceMemory['bookmarks'] {
  return Array.isArray(stored) && stored.every((each: unknown) => typeof each === 'object' && each !== null && typeof (each as Record<string, unknown>).name === 'string' && Number.isFinite((each as Record<string, unknown>).bar));
}

function asTrainer(stored: unknown): stored is PieceMemory['trainer'] {
  if (typeof stored !== 'object' || stored === null) return false;
  const { on, from, to, step, every } = stored as Record<string, unknown>;
  return typeof on === 'boolean' && [from, to, step, every].every((value) => typeof value === 'number' && Number.isFinite(value));
}
