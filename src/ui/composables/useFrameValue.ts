import { shallowReadonly, shallowRef, type Ref } from 'vue';
import { useAnimationFrame } from './useAnimationFrame';

/**
 * What the music has come to, read at every animation frame (where it is, the bar, the beat of the
 * count-in), as a ref that changes only when what is read does: the interface is updated when
 * there is something new to show, not sixty times a second.
 */
export function useFrameValue<T>(read: () => T): Readonly<Ref<T>> {
  const value = shallowRef(read());
  useAnimationFrame(() => {
    const now = read();
    if (now !== value.value) value.value = now;
  });
  return shallowReadonly(value);
}
