import { onMounted, onUnmounted, type ShallowRef } from 'vue';

/** Calls `resized` whenever the element's size changes (and once when watching begins), while the component is mounted. */
export function useResize(element: Readonly<ShallowRef<Element | null>>, resized: () => void): void {
  const observer = new ResizeObserver(resized);
  onMounted(() => {
    if (element.value) observer.observe(element.value);
  });
  onUnmounted(() => observer.disconnect());
}
