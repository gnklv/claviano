import type { Hand } from '../../domain/note';
import type { Score } from '../../domain/score';
import type { BarLoop } from './BarLoop';
import type { Playback } from './Playback';
import type { TempoTrainer, TrainerState } from './TempoTrainer';

/*
 * The way a piece is had: listened to, or learnt. Listening is the piece whole: both hands, at its
 * own tempo, no loop, no trainer. Learning is what one has set to learn it by (the loop, a hand, the
 * tempo, the trainer); going to listen keeps that aside, and coming back to learn sets it again.
 * Each is asked of what holds it: the loop of the loop, the tempo and the hands of playback, the
 * trainer of the trainer.
 */

export type Way = 'learn' | 'listen';

/** What learning had set: kept aside while the piece is listened to. */
export interface Learning {
  readonly tempo: number;
  readonly loop: { readonly on: boolean; readonly from: number; readonly to: number };
  readonly hands: Readonly<Record<Hand, boolean>>;
  readonly trainer: TrainerState;
}

const HANDS: readonly Hand[] = ['right', 'left'];

export class PieceWay {
  private current: Way = 'learn';
  private kept: Learning | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly playback: Playback,
    private readonly loop: BarLoop,
    private readonly trainer: TempoTrainer,
  ) {
    // Another piece is learnt from the start (and set as it was left, if it was: see rememberPieces).
    let score: Score | null = playback.score;
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      if (this.current === 'learn' && !this.kept) return;
      this.current = 'learn';
      this.kept = null;
      this.emit();
    });
  }

  get way(): Way {
    return this.current;
  }

  /** What learning had set, while the piece is listened to (null while it is learnt: it is what is set now). */
  get learning(): Learning | null {
    return this.kept;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(way: Way): void {
    if (way === this.current) return;
    if (way === 'listen') {
      this.kept = this.what();
      this.trainer.setEnabled(false);
      this.loop.setEnabled(false);
      for (const hand of HANDS) this.playback.setHandEnabled(hand, true);
      this.playback.setTempo(1);
    } else if (this.kept) {
      const { tempo, loop, hands, trainer } = this.kept;
      this.kept = null;
      for (const hand of HANDS) this.playback.setHandEnabled(hand, hands[hand]);
      this.loop.setFrom(loop.from);
      this.loop.setTo(loop.to);
      this.loop.setEnabled(loop.on);
      this.playback.setTempo(tempo);
      // (The trainer as it was, at the tempo its training had got to.)
      this.trainer.restore(trainer);
    }
    this.current = way;
    this.emit();
  }

  /** What learning has set now. */
  private what(): Learning {
    const { playback, loop, trainer } = this;
    return {
      tempo: playback.tempo,
      loop: { on: loop.enabled, from: loop.from, to: loop.to },
      hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
      trainer: { on: trainer.enabled, plan: trainer.plan },
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
