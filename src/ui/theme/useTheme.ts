import { computed, readonly, ref, watch } from 'vue';
import { DEFAULT_THEME_SETTING, THEME_SETTINGS, resolveTheme, type Theme, type ThemeSetting } from './resolveTheme';

/** Also read by the inline script in index.html, which sets the theme before the first paint. */
const STORAGE_KEY = 'claviano.theme';

function initialSetting(): ThemeSetting {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (THEME_SETTINGS as readonly string[]).includes(saved)) return saved as ThemeSetting;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return DEFAULT_THEME_SETTING;
}

const setting = ref<ThemeSetting>(initialSetting());

// Follow the system theme live, e.g. when macOS switches to dark in the evening.
const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemPrefersDark = ref(systemQuery.matches);
systemQuery.addEventListener('change', (event) => (systemPrefersDark.value = event.matches));

const resolvedTheme = computed(() => resolveTheme(setting.value, systemPrefersDark.value));

/**
 * The theme actually on the page. With a view transition it changes a moment after
 * `resolvedTheme`, once the browser has taken its snapshot of the old look.
 */
const appliedTheme = ref<Theme>(resolvedTheme.value);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyTheme(theme: Theme, animate: boolean): void {
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    appliedTheme.value = theme;
  };
  // A cross-fade of the whole page, canvas included. Browsers without the API,
  // and people who asked the system for less motion, get an instant switch.
  if (animate && !reducedMotion.matches && 'startViewTransition' in document) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

watch(resolvedTheme, (theme, previous) => applyTheme(theme, previous !== undefined), { immediate: true });

watch(setting, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not remembering the choice is fine.
  }
});

export function useTheme() {
  return { setting, theme: readonly(appliedTheme) };
}
