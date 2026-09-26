import { ref, watch } from 'vue';

export type ViewMode = 'staff' | 'keys' | 'both';

export const VIEW_MODES: readonly ViewMode[] = ['staff', 'keys', 'both'];

const STORAGE_KEY = 'claviano.view';

function initialViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (VIEW_MODES as readonly string[]).includes(saved)) return saved as ViewMode;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return 'keys';
}

/** Which views are shown: staff, falling notes with keyboard, or both. Remembered between visits. */
const viewMode = ref<ViewMode>(initialViewMode());

watch(viewMode, (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembering the choice is fine.
  }
});

export function useViewMode() {
  return viewMode;
}
