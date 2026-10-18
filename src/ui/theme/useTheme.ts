import { computed, effectScope, readonly, ref, watch, type EffectScope, type Ref } from 'vue';
import { useMediaQuery } from '../composables/useMediaQuery';
import { preference } from '../preferences';
import { DEFAULT_THEME_SETTING, THEME_SETTINGS, resolveTheme, type Theme, type ThemeSetting } from './resolveTheme';

/** Also read by the inline script in index.html, which sets the theme before the first paint. */
const STORAGE_KEY = 'claviano.theme';

const setting = preference<ThemeSetting>(STORAGE_KEY, THEME_SETTINGS, DEFAULT_THEME_SETTING);

/** The theme followed: what was chosen and what the system prefers, and the theme on the page. */
interface Followed {
  readonly scope: EffectScope;
  /** The theme actually on the page. With a view transition it changes a moment after the one chosen, once the browser has taken its snapshot of the old look. */
  readonly applied: Readonly<Ref<Theme>>;
}

let followed: Followed | null = null;

function follow(): Followed {
  const scope = effectScope(true);
  const applied = ref<Theme>('light');
  scope.run(() => {
    // Follow the system theme live, e.g. when macOS switches to dark in the evening.
    const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
    const lessMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const resolved = computed(() => resolveTheme(setting.value, systemPrefersDark.value));
    const apply = (theme: Theme, animate: boolean) => {
      const show = () => {
        document.documentElement.dataset.theme = theme;
        applied.value = theme;
        // The system's bar over the page (a phone's status bar, an installed app's title bar) takes the header's colour.
        const header = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        if (header) document.querySelector('meta[name=theme-color]')?.setAttribute('content', header);
      };
      // A cross-fade of the whole page, canvas included. Browsers without the API,
      // and people who asked the system for less motion, get an instant switch.
      if (animate && !lessMotion.value && 'startViewTransition' in document) document.startViewTransition(show);
      else show();
    };
    watch(resolved, (theme, previous) => apply(theme, previous !== undefined), { immediate: true });
  });
  return { scope, applied };
}

/** Starts following the theme, afresh: as the page loads (main.ts), and before each test. */
export function startTheme(): void {
  followed?.scope.stop();
  followed = follow();
}

export function useTheme() {
  followed ??= follow();
  return { setting, theme: readonly(followed.applied) };
}
