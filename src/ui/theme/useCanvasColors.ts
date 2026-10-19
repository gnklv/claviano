import { watch } from 'vue';
import { useTheme } from './useTheme';

/**
 * The theme's colours for a view drawn on a canvas, which cannot follow CSS variables by itself:
 * `read` reads them as they stand now (for the view to be made with), and they are read again and
 * given to `view()` whenever the theme changes, once the new one is applied.
 */
export function useCanvasColors<C>(read: () => C, view: () => { setColors(colors: C): void } | null): () => C {
  const { theme } = useTheme();
  watch(theme, () => view()?.setColors(read()), { flush: 'post' });
  return read;
}
