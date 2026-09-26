import { en, type Dictionary, type MessageKey } from './en';
import { ru } from './ru';

export type Locale = 'ru' | 'en';
export type Params = Record<string, string | number>;

export const LOCALES: readonly Locale[] = ['ru', 'en'];
export const DICTIONARIES: Record<Locale, Dictionary> = { ru, en };

const pluralRules = new Map<Locale, Intl.PluralRules>();
const pluralRulesFor = (locale: Locale): Intl.PluralRules => {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
};

/**
 * Looks up `key` and fills in `{placeholders}` from `params`.
 * For plural messages the form is chosen by `params.count`.
 */
export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
  const message = DICTIONARIES[locale][key];
  const template =
    typeof message === 'string'
      ? message
      : (message[pluralRulesFor(locale).select(Number(params.count ?? 0))] ?? message.other);
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
