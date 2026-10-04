import { inject, type InjectionKey } from 'vue';
import type { Instrument } from '../application/ports/Instrument';
import type { RollView } from '../application/ports/RollView';
import type { StaffView } from '../application/ports/StaffView';
import type { BarLoop } from '../application/use-cases/BarLoop';
import type { DemoPiece, OpenScore } from '../application/use-cases/OpenScore';
import type { Playback } from '../application/use-cases/Playback';
import type { MessageKey } from './i18n/en';

/** A demo with its name in the menu and as the score title, from the dictionary (so it follows the language). */
export interface Demo extends DemoPiece {
  readonly title: MessageKey;
}

/** Everything the UI needs from the outside world; wired up in main.ts. */
export interface AppDeps {
  readonly playback: Playback;
  readonly barLoop: BarLoop;
  /** The piano's sound: whether it has loaded. */
  readonly instrument: Instrument;
  readonly openScore: OpenScore;
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
