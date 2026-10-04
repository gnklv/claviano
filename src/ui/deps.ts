import { inject, type InjectionKey } from 'vue';
import type { Instrument } from '../application/ports/Instrument';
import type { RollView } from '../application/ports/RollView';
import type { StaffView } from '../application/ports/StaffView';
import type { BarLoop } from '../application/use-cases/BarLoop';
import type { LoadScore } from '../application/use-cases/LoadScore';
import type { Playback } from '../application/use-cases/Playback';
import type { Score } from '../domain/score';
import type { MessageKey } from './i18n/en';

/** A built-in piece to try the player without a file of one's own. */
export interface Demo {
  readonly id: string;
  /** Its name in the menu and as the score title, from the dictionary (so it follows the language). */
  readonly title: MessageKey;
  load(): Score | Promise<Score>;
}

/** Everything the UI needs from the outside world; wired up in main.ts. */
export interface AppDeps {
  readonly playback: Playback;
  readonly barLoop: BarLoop;
  /** The piano's sound: whether it has loaded. */
  readonly instrument: Instrument;
  readonly loadScore: LoadScore;
  readonly createRoll: (canvas: HTMLCanvasElement) => RollView;
  readonly createStaff: (container: HTMLElement) => StaffView;
  readonly demos: readonly Demo[];
}

export const depsKey: InjectionKey<AppDeps> = Symbol('deps');

export function useDeps(): AppDeps {
  const deps = inject(depsKey);
  if (!deps) throw new Error('App dependencies are not provided');
  return deps;
}
