import { onMounted, onUnmounted, type ShallowRef } from 'vue';
import { useResize } from './useResize';

/** What a view drawn into an element is told by the component that owns the element (see the ports' views). */
interface Drawn {
  resize(): void;
}

/**
 * A view drawn into an element of the component: made once the element is there, told when the
 * element's size changes, or the screen's density (the window taken to another screen, the page
 * zoomed: a canvas drawn for the old one is blurred), and gone with the component. `resized`: what
 * else is done at a new size (a canvas given a new size is blank: it is drawn again at once).
 */
export function useDrawnView<E extends Element, V extends Drawn>(
  element: Readonly<ShallowRef<E | null>>,
  make: (element: E) => V,
  resized?: () => void,
): { readonly view: V | null } {
  const drawn: { view: V | null } = { view: null };
  const sized = () => {
    drawn.view?.resize();
    resized?.();
  };
  onMounted(() => (drawn.view = make(element.value!)));
  useResize(element, sized);

  // (A query for the density there is now, asked anew each time it stops being true.)
  let stopWatching = () => {};
  const watchDensity = () => {
    const media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    if (!media) return;
    const changed = () => {
      sized();
      watchDensity();
    };
    media.addEventListener('change', changed, { once: true });
    stopWatching = () => media.removeEventListener('change', changed);
  };
  onMounted(watchDensity);
  onUnmounted(() => stopWatching());
  return drawn;
}
