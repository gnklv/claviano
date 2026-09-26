import { ref, watchEffect } from 'vue';
import type { MessageKey } from './en';
import { noteLabel } from './notes';
import { LOCALES, translate, type Locale, type Params } from './translate';

const STORAGE_KEY = 'claviano.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** One language for the whole app; components re-render when it changes. */
const locale = ref<Locale>(initialLocale());

watchEffect(() => {
  document.documentElement.lang = locale.value;
  try {
    localStorage.setItem(STORAGE_KEY, locale.value);
  } catch {
    // Not remembering the choice is fine.
  }
});

export function useI18n() {
  return {
    locale,
    locales: LOCALES,
    t: (key: MessageKey, params?: Params) => translate(locale.value, key, params),
    noteLabel: (midi: number) => noteLabel(midi, locale.value),
  };
}
