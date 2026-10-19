import { onMounted, onUnmounted } from 'vue';

/** Runs `callback` every animation frame while the component is mounted. */
export function useAnimationFrame(callback: () => void): void {
  let id = 0;
  const frame = () => {
    callback();
    id = requestAnimationFrame(frame);
  };
  onMounted(() => (id = requestAnimationFrame(frame)));
  onUnmounted(() => cancelAnimationFrame(id));
}
