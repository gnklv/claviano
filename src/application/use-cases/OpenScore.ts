import type { Score } from '../../domain/score';
import { ScoreLoadError, type ScoreLoadErrorCode } from '../ports/ScoreParser';
import type { LoadScore } from './LoadScore';
import type { Playback } from './Playback';

/** A built-in piece to try the player without a file of one's own. */
export interface DemoPiece {
  readonly id: string;
  load(): Score | Promise<Score>;
}

/** What could not be opened and why, as data: the UI says it in the user's language. */
export interface OpenFailure {
  /** The file's name, or the demo that failed to load. */
  readonly source: { readonly file: string } | { readonly demo: DemoPiece };
  readonly reason: ScoreLoadErrorCode | 'unknown';
}

/**
 * Opening a piece: a file the user chose, or a built-in demo. The piece goes to playback; a
 * failure leaves what was open as it was, and is kept until something opens.
 */
export class OpenScore {
  private opened: { score: Score; demo: DemoPiece } | null = null;
  private failed: OpenFailure | null = null;
  /** Counts the openings asked for: a slow demo that arrives after something else was asked for is dropped. */
  private asked = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly playback: Playback,
    private readonly loadScore: LoadScore,
  ) {}

  /** The demo that is open now; null for a file, or when nothing is open. */
  get demo(): DemoPiece | null {
    return this.opened && this.opened.score === this.playback.score ? this.opened.demo : null;
  }

  /** The last opening, if it failed. */
  get failure(): OpenFailure | null {
    return this.failed;
  }

  /** Called when a piece opens or fails to. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Opens a file by its name (the format is told by its extension) and content. */
  openFile(name: string, data: ArrayBuffer): void {
    this.asked++;
    try {
      this.open(this.loadScore.execute(name, data), null);
    } catch (error) {
      this.fail({ file: name }, error);
    }
  }

  /** Opens a demo once it is loaded (some are fetched). */
  async openDemo(demo: DemoPiece): Promise<void> {
    const asked = ++this.asked;
    try {
      const score = await demo.load();
      if (asked === this.asked) this.open(score, demo);
    } catch (error) {
      if (asked === this.asked) this.fail({ demo }, error);
    }
  }

  private open(score: Score, demo: DemoPiece | null): void {
    this.failed = null;
    this.opened = demo ? { score, demo } : null;
    this.playback.load(score);
    this.emit();
  }

  private fail(source: OpenFailure['source'], error: unknown): void {
    const known = error instanceof ScoreLoadError;
    // Not one of the reasons a file can be wrong for: something of ours broke, worth a look.
    if (!known) console.error(error);
    this.failed = { source, reason: known ? error.code : 'unknown' };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
