import { barAt, barNumber } from '../../domain/score';
import type { PieceMemory } from '../ports/PieceShelf';
import type { BarLoop } from './BarLoop';
import type { Library } from './Library';
import type { Playback } from './Playback';

/** Left this close to the end (in seconds), a piece starts from the beginning next time. */
const AT_THE_END = 0.5;

/**
 * Coming back to a piece is coming back to where it was left: its place, tempo, loop and hands
 * are kept with it, and set again when it is opened. A piece opened for the first time starts
 * plain: from the beginning, at full tempo, both hands, no loop.
 *
 * Returns a function that writes down where the open piece stands now: to call when the page is
 * about to go (the place moves on while the music plays, and nothing tells of that).
 */
export function rememberPieces(library: Library, playback: Playback, barLoop: BarLoop): () => void {
  let current = library.current;
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
      bar: barNumber(score, barAt(score, position)),
      bars: barNumber(score, score.bars.length - 1),
    };
  };

  const save = (): void => {
    const id = library.current;
    // (Between two pieces, while the next one loads, there is nothing to write down.)
    if (restoring || id === null || id !== current) return;
    const memory = now();
    if (!memory) return;
    const value = id + JSON.stringify(memory);
    if (value === last) return;
    last = value;
    library.remember(id, memory);
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
    restoring = false;
  };

  library.onChange(() => {
    const id = library.current;
    if (id === current) return;
    current = id;
    if (id !== null) restore(library.memory(id));
    save();
  });
  playback.onChange(save);
  barLoop.onChange(save);
  return save;
}
