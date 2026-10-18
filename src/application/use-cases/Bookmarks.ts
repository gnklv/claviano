import { barIndexNear, type Score } from '../../domain/score';
import type { BarLoop } from './BarLoop';
import type { Playback } from './Playback';

/*
 * Bookmarks in a piece: named places ("the reprise", "the hard bars") to go to at a press. A
 * bookmark is a printed bar, as the loop's are; with repeats it means the pass nearest to where the
 * music is, as a press on the staff does.
 */

export interface Bookmark {
  readonly name: string;
  /** The printed bar, as numbered on the page. */
  readonly bar: number;
}

export class Bookmarks {
  private list: Bookmark[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly playback: Playback,
    private readonly loop: BarLoop,
  ) {
    // A new piece has bookmarks of its own (set again from what is remembered of it, if anything).
    let score: Score | null = playback.score;
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      if (this.list.length === 0) return;
      this.list = [];
      this.emit();
    });
  }

  /** The piece's bookmarks, in the order of its bars. */
  get all(): readonly Bookmark[] {
    return this.list;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The bookmarks as they were left with the piece. */
  set(bookmarks: readonly Bookmark[]): void {
    this.list = sorted(bookmarks);
    this.emit();
  }

  add(name: string, bar: number): void {
    this.list = sorted([...this.list, { name: name.trim() || String(bar), bar }]);
    this.emit();
  }

  rename(index: number, name: string): void {
    const bookmark = this.list[index];
    if (!bookmark || !name.trim() || name.trim() === bookmark.name) return;
    this.list = this.list.map((each, i) => (i === index ? { ...each, name: name.trim() } : each));
    this.emit();
  }

  remove(index: number): void {
    if (!this.list[index]) return;
    this.list = this.list.filter((_, i) => i !== index);
    this.emit();
  }

  /** To the bookmark's bar, the pass nearest to where the music is; out of the loop, the loop is let go. Playing goes on from there. */
  goTo(index: number): void {
    const score = this.playback.score;
    const bookmark = this.list[index];
    if (!score || !bookmark) return;
    this.loop.jumpTo(score.bars[barIndexNear(score, bookmark.bar, this.playback.position)] ?? 0);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** In the order of the bars; two at one bar, in the order they were made. */
const sorted = (bookmarks: readonly Bookmark[]): Bookmark[] => [...bookmarks].sort((a, b) => a.bar - b.bar);
