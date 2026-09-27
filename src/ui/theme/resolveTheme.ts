/** What the user picked; "auto" follows the operating system. */
export type ThemeSetting = 'auto' | 'light' | 'dark';
/** What is actually shown. */
export type Theme = 'light' | 'dark';

export const THEME_SETTINGS: readonly ThemeSetting[] = ['auto', 'light', 'dark'];
export const DEFAULT_THEME_SETTING: ThemeSetting = 'auto';

export const resolveTheme = (setting: ThemeSetting, systemPrefersDark: boolean): Theme =>
  setting === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : setting;
