import { onMounted, type ShallowRef } from 'vue';
import { useResize } from './useResize';

/** What a view drawn into an element is told by the component that owns the element (see the ports' views). */
interface Drawn {
  resize(): void;
}

/**
 * A view drawn into an element of the component: made once the element is there, told when the
 * element's size changes, and gone with the component. `resized`: what else is done at a new size
 * (a canvas given a new size is blank: it is drawn again at once).
 */
export function useDrawnView<E extends Element, V extends Drawn>(
  element: Readonly<ShallowRef<E | null>>,
  make: (element: E) => V,
  resized?: () => void,
): { readonly view: V | null } {
  const drawn: { view: V | null } = { view: null };
  onMounted(() => (drawn.view = make(element.value!)));
  useResize(element, () => {
    drawn.view?.resize();
    resized?.();
  });
  return drawn;
}
