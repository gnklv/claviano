import { onMounted, onUnmounted } from 'vue';

/** Listens on the window for `type` while the component is mounted (keys pressed anywhere, the window losing focus). */
export function useWindowListener<K extends keyof WindowEventMap>(type: K, listener: (event: WindowEventMap[K]) => void): void {
  onMounted(() => window.addEventListener(type, listener));
  onUnmounted(() => window.removeEventListener(type, listener));
}
