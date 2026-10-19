import { onScopeDispose } from 'vue';
import { Glide } from './glide';
import { useMediaQuery } from '../browser/useMediaQuery';

/**
 * A glide for something a component lets be drawn along by hand (see ui/motion/glide.ts): `move`
 * moves it by so many pixels and says by how many it could. The component tells the glide of the
 * hand: `hold` when it takes hold, `follow` as it moves, `letGo` when it lets go.
 */
export function useGlide(move: (by: number) => number): Glide {
  const lessMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const glide = new Glide(move, {
    now: () => performance.now(),
    nextFrame(step) {
      const id = requestAnimationFrame(step);
      return () => cancelAnimationFrame(id);
    },
    still: () => lessMotion.value,
  });
  onScopeDispose(() => glide.rest());
  return glide;
}
