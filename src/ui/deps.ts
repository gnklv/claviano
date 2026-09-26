import { inject, type InjectionKey } from 'vue';
import type { LoadScore } from '../application/use-cases/LoadScore';
import type { Playback } from '../application/use-cases/Playback';
import type { Score } from '../domain/score';
import type { CanvasPianoRoll } from '../infrastructure/render/CanvasPianoRoll';
import type { SvgStaff } from '../infrastructure/render/SvgStaff';

/** Everything the UI needs from the outside world; wired up in main.ts. */
export interface AppDeps {
  readonly playback: Playback;
  readonly loadScore: LoadScore;
  readonly createRoll: (canvas: HTMLCanvasElement) => CanvasPianoRoll;
  readonly createStaff: (container: HTMLElement) => SvgStaff;
  readonly demoScore: (title: string) => Score;
}

export const depsKey: InjectionKey<AppDeps> = Symbol('deps');

export function useDeps(): AppDeps {
  const deps = inject(depsKey);
  if (!deps) throw new Error('App dependencies are not provided');
  return deps;
}
