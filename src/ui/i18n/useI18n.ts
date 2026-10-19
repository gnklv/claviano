import { watchEffect } from 'vue';
import type { MessageKey } from './en';
import { preference } from '../kept/preferences';
import { noteLabel } from './notes';
import { LOCALES, translate, type Locale, type Params } from './translate';

/** One language for the whole app; components re-render when it changes. Until one is chosen, the browser's. */
const locale = preference<Locale>('claviano.locale', LOCALES, () => (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'));

watchEffect(() => {
  document.documentElement.lang = locale.value;
});

export function useI18n() {
  return {
    locale,
    locales: LOCALES,
    t: (key: MessageKey, params?: Params) => translate(locale.value, key, params),
    noteLabel: (midi: number) => noteLabel(midi, locale.value),
  };
}
