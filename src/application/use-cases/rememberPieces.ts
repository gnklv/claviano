import { barAt, barNumber } from '../../domain/score';
import type { PieceMemory } from '../ports/PieceShelf';
import type { BarLoop } from './BarLoop';
import type { Bookmarks } from './Bookmarks';
import type { OwnFingering } from './OwnFingering';
import type { Library } from './Library';
import type { PieceMemories } from './PieceMemories';
import type { Playback } from './Playback';
import { DEFAULT_PLAN, type TempoTrainer } from './TempoTrainer';

/** Left this close to the end (in seconds), a piece starts from the beginning next time. */
const AT_THE_END = 0.5;

/**
 * Coming back to a piece is coming back to where it was left: its place, tempo, loop, hands, tempo
 * trainer, bookmarks and one's own fingering are kept with it, and set again when it is opened. A
 * piece opened for the first time starts plain: from the beginning, at full tempo, both hands, no
 * loop, no trainer, no bookmarks, no fingers of one's own.
 *
 * Returns a function that writes down where the open piece stands now: to call when the page is
 * about to go (the place moves on while the music plays, and nothing tells of that).
 *
 * A piece taken off the shelf takes what is remembered of it along.
 */
/** What of practising a piece is kept with it. */
export interface Practice {
  readonly playback: Playback;
  readonly barLoop: BarLoop;
  readonly trainer: TempoTrainer;
  readonly bookmarks: Bookmarks;
  readonly fingering: OwnFingering;
}

export function rememberPieces(library: Library, memories: PieceMemories, { playback, barLoop, trainer, bookmarks, fingering }: Practice): () => void {
  let current = library.current;
  /** The piece whose memory has been set since it opened (none, while what was kept is still being read). */
  let restored: string | null = null;
  let shelved = new Set(library.pieces.map((piece) => piece.id));
  /** While a piece's memory is being set, the changes it makes are not news of their own. */
  let restoring = false;
  let last = '';

  const now = (): PieceMemory | null => {
    const score = playback.score;
    if (!score) return null;
    const position = playback.position;
    return {
      position,
      tempo: playback.tempo,
      hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
      loop: { on: barLoop.enabled, from: barLoop.from, to: barLoop.to },
      trainer: { on: trainer.enabled, ...trainer.plan },
      bookmarks: bookmarks.all,
      fingers: fingering.all,
      bar: barNumber(score, barAt(score, position)),
      bars: barNumber(score, score.bars.length - 1),
    };
  };

  const save = (): void => {
    const id = library.current;
    // (Between two pieces, while the next one loads, there is nothing to write down; nor before
    // what was kept of it has been set.)
    if (restoring || id === null || id !== current || restored !== id) return;
    const memory = now();
    if (!memory) return;
    const value = id + JSON.stringify(memory);
    if (value === last) return;
    last = value;
    memories.remember(id, memory);
  };

  const restore = (memory: PieceMemory | null): void => {
    const score = playback.score;
    if (!score) return;
    restoring = true;
    playback.setTempo(memory?.tempo ?? 1);
    playback.setHandEnabled('right', memory?.hands.right ?? true);
    playback.setHandEnabled('left', memory?.hands.left ?? true);
    playback.seek(memory && memory.position < score.duration - AT_THE_END ? memory.position : 0);
    if (memory) {
      barLoop.setFrom(memory.loop.from);
      barLoop.setTo(memory.loop.to);
    }
    barLoop.setEnabled(memory?.loop.on ?? false);
    const kept = memory?.trainer;
    trainer.restore(kept ? { on: kept.on, plan: { from: kept.from, to: kept.to, step: kept.step, every: kept.every, back: kept.back ?? false } } : { on: false, plan: DEFAULT_PLAN });
    bookmarks.set(memory?.bookmarks ?? []);
    fingering.set(memory?.fingers ?? []);
    restoring = false;
  };

  /** Sets the open piece's memory, once what was kept has been read; and only once for each opening. */
  const restoreCurrent = (): void => {
    if (current === null || restored === current || !memories.loaded) return;
    restored = current;
    restore(memories.memory(current));
  };

  library.onChange(() => {
    const now = new Set(library.pieces.map((piece) => piece.id));
    for (const id of shelved) if (!now.has(id)) memories.forget(id);
    shelved = now;

    const id = library.current;
    if (id === current) return;
    current = id;
    restored = null;
    restoreCurrent();
    save();
  });
  memories.onChange(restoreCurrent);
  playback.onChange(save);
  barLoop.onChange(save);
  trainer.onChange(save);
  bookmarks.onChange(save);
  fingering.onChange(save);
  return save;
}
