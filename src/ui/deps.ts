import { inject, type InjectionKey } from 'vue';
import type { Instrument } from '../application/ports/Instrument';
import type { RollView } from '../application/ports/RollView';
import type { StaffView } from '../application/ports/StaffView';
import type { TilesView } from '../application/ports/TilesView';
import type { BarLoop } from '../application/use-cases/BarLoop';
import type { Bookmarks } from '../application/use-cases/Bookmarks';
import type { OwnFingering } from '../application/use-cases/OwnFingering';
import type { FreePlay } from '../application/use-cases/FreePlay';
import type { Library } from '../application/use-cases/Library';
import type { PieceMemories } from '../application/use-cases/PieceMemories';
import type { DemoPiece, OpenScore } from '../application/use-cases/OpenScore';
import type { Playback } from '../application/use-cases/Playback';
import type { Recorder } from '../application/use-cases/Recorder';
import type { TempoTrainer } from '../application/use-cases/TempoTrainer';
import type { Volume } from '../application/use-cases/Volume';
import type { MessageKey } from './i18n/en';

/** A demo with its name in the menu and as the score title, from the dictionary (so it follows the language). */
export interface Demo extends DemoPiece {
  readonly title: MessageKey;
}

/** Everything the UI needs from the outside world; wired up in main.ts. */
export interface AppDeps {
  readonly playback: Playback;
  readonly barLoop: BarLoop;
  /** The loop that quickens by itself. */
  readonly trainer: TempoTrainer;
  /** The open piece's named places. */
  readonly bookmarks: Bookmarks;
  /** The open piece's fingering set by hand. */
  readonly fingering: OwnFingering;
  /** How loud the notes and the metronome are. */
  readonly volume: Volume;
  /** The piano's sound: whether it has loaded. */
  readonly instrument: Instrument;
  readonly openScore: OpenScore;
  /** The shelf of pieces opened before, and opening a piece from it. */
  readonly library: Library;
  /** How each piece was left. */
  readonly memories: PieceMemories;
  /** Playing by hand, from the keys on the screen. */
  readonly freePlay: FreePlay;
  /** Recording what is played there. */
  readonly recorder: Recorder;
  /** Keeps the take as a piece on the shelf, under `title`, and opens it. */
  readonly keepTake: (title: string, fileName: string) => Promise<void>;
  readonly createRoll: (canvas: HTMLCanvasElement) => RollView;
  readonly createStaff: (container: HTMLElement) => StaffView;
  readonly createTiles: (canvas: HTMLCanvasElement) => TilesView;
  readonly demos: readonly Demo[];
}

export const depsKey: InjectionKey<AppDeps> = Symbol('deps');

export function useDeps(): AppDeps {
  const deps = inject(depsKey);
  if (!deps) throw new Error('App dependencies are not provided');
  return deps;
}
