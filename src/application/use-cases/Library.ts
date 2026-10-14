import { contentId } from '../../domain/contentId';
import type { Score } from '../../domain/score';
import type { PieceShelf, ShelvedPiece } from '../ports/PieceShelf';
import type { DemoPiece, OpenScore } from './OpenScore';
import type { Playback } from './Playback';

/** A demo's place among the pieces: demos are always there, and are not kept on the shelf. */
export const demoPieceId = (demo: DemoPiece): string => `demo.${demo.id}`;

/**
 * The shelf of one's pieces: a file opened once stays on it, the latest first, and is opened again
 * from there. The same file opened again is the same piece, told by its content, not its name.
 *
 * Every piece has an id (a demo too), so the piece that is open can be named: in the address, and
 * to open it again after the page is reloaded.
 *
 * A shelf that cannot be read or written (a private window) is no failure: pieces open as they
 * would without one. (How each piece was left is PieceMemories'.)
 */
export class Library {
  private shelved: ShelvedPiece[] = [];
  /** The piece being opened, until it opens or fails. */
  private pending: string | null = null;
  private opened: { id: string; score: Score } | null = null;
  /** Counts the openings asked for: a file that arrives from the shelf after something else was asked for is dropped. */
  private asked = 0;
  private loaded: Promise<void> = Promise.resolve();
  /** Whether the shelf keeps what it is given; found out as it is read and written. */
  private keeping = true;
  private protectionAsked = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly shelf: PieceShelf,
    private readonly openScore: OpenScore,
    private readonly playback: Playback,
    private readonly demos: readonly DemoPiece[],
    private readonly now: () => number = () => Date.now(),
  ) {
    openScore.onChange(() => {
      const score = playback.score;
      if (this.pending !== null && !openScore.failure && score) this.opened = { id: this.pending, score };
      this.pending = null;
      this.emit();
    });
  }

  /** The pieces on the shelf, the last opened first. */
  get pieces(): readonly ShelvedPiece[] {
    return this.shelved;
  }

  /** The piece that is open now (a demo's id for a demo); null when nothing is. */
  get current(): string | null {
    return this.opened && this.opened.score === this.playback.score ? this.opened.id : null;
  }

  /** False where nothing can be kept (a private window, no room): pieces open, and are gone with the page. */
  get keeps(): boolean {
    return this.keeping;
  }

  /** Called when the shelf changes, or another piece is open. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the shelf: once, when the app starts. */
  load(): Promise<void> {
    this.loaded = this.shelf.list().then(
      (pieces) => {
        this.shelved = sorted(pieces);
        this.kept(true);
      },
      () => {
        // No shelf: nothing is on it.
        this.kept(false);
      },
    );
    return this.loaded;
  }

  /** Opens a file, and puts it on the shelf if it opened: under `title`, if given, else the piece's own. */
  async openFile(name: string, data: ArrayBuffer, title?: string): Promise<void> {
    const id = contentId(data);
    this.asked++;
    this.pending = id;
    this.openScore.openFile(name, data);
    if (this.current !== id) return;
    const known = this.shelved.find((piece) => piece.id === id);
    const shelved = known?.title ?? title ?? this.playback.score?.title ?? name;
    await this.keep({ id, fileName: known?.fileName ?? name, title: shelved, openedAt: this.now() }, known ? undefined : data);
  }

  /** Opens a piece by its id: a demo, or one from the shelf. An id nobody knows opens nothing. */
  async open(id: string): Promise<void> {
    const asked = ++this.asked;
    // (The shelf is read first: the piece may be on it.)
    await this.loaded;
    if (asked !== this.asked) return;
    const demo = this.demos.find((candidate) => demoPieceId(candidate) === id);
    if (demo) {
      this.pending = id;
      await this.openScore.openDemo(demo);
      return;
    }
    const piece = this.shelved.find((candidate) => candidate.id === id);
    const data = piece ? await this.shelf.file(id).catch(() => null) : null;
    if (!piece || !data || asked !== this.asked) return;
    this.pending = id;
    this.openScore.openFile(piece.fileName, data);
    if (this.current === id) await this.keep({ ...piece, openedAt: this.now() });
  }

  /** Gives a piece on the shelf another name (its file keeps its own). */
  async rename(id: string, title: string): Promise<void> {
    const piece = this.shelved.find((candidate) => candidate.id === id);
    const name = title.trim();
    if (piece && name && name !== piece.title) await this.keep({ ...piece, title: name });
  }

  /** A piece's file as it was given, with its name: to save it out. Null when it is not there. */
  async file(id: string): Promise<{ name: string; data: ArrayBuffer } | null> {
    const piece = this.shelved.find((candidate) => candidate.id === id);
    const data = piece ? await this.shelf.file(id).catch(() => null) : null;
    return piece && data ? { name: piece.fileName, data } : null;
  }

  /** Takes a piece off the shelf, for good: its file and what was remembered of it go too. */
  async remove(id: string): Promise<void> {
    if (!this.shelved.some((piece) => piece.id === id)) return;
    try {
      await this.shelf.remove(id);
    } catch {
      // Still there: it stays on the shelf.
      return;
    }
    this.shelved = this.shelved.filter((piece) => piece.id !== id);
    // (If it is the one that is open, it plays on, as a piece of no shelf: nothing more is remembered of it.)
    if (this.opened?.id === id) this.opened = null;
    this.emit();
  }

  private async keep(piece: ShelvedPiece, data?: ArrayBuffer): Promise<void> {
    try {
      await this.shelf.save(piece, data);
    } catch {
      // Not kept: the piece is open all the same.
      this.kept(false);
      return;
    }
    // With something of one's own on the shelf, it is worth asking that the shelf be kept for good.
    if (!this.protectionAsked) {
      this.protectionAsked = true;
      this.shelf.protect().catch(() => {});
    }
    this.keeping = true;
    this.shelved = sorted([piece, ...this.shelved.filter((other) => other.id !== piece.id)]);
    this.emit();
  }

  private kept(keeping: boolean): void {
    this.keeping = keeping;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const sorted = (pieces: readonly ShelvedPiece[]): ShelvedPiece[] => [...pieces].sort((a, b) => b.openedAt - a.openedAt);
