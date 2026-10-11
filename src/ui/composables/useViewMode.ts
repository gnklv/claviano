import { computed, ref, watch, type ComputedRef, type WritableComputedRef } from 'vue';
import { SMALL_SCREEN, useMediaQuery } from './useMediaQuery';

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

/** The views there is room to choose from on this screen. */
export function useOfferedViewModes(): ComputedRef<readonly ViewMode[]> {
  // A phone has no height for the staff and the keys at once: upright the keys are too far down, on its side the staff is too small to read.
  const small = useMediaQuery(SMALL_SCREEN);
  return computed(() => (small.value ? VIEW_MODES.filter((mode) => mode !== 'both') : VIEW_MODES));
}

/**
 * The view shown on this screen: the one chosen, or the keys where "both" was chosen and does not
 * fit. The choice itself is kept: on a wider screen (or the phone turned) it is "both" again.
 */
export function useShownViewMode(): WritableComputedRef<ViewMode> {
  const offered = useOfferedViewModes();
  return computed({
    get: () => (offered.value.includes(viewMode.value) ? viewMode.value : 'keys'),
    set: (mode) => (viewMode.value = mode),
  });
}
