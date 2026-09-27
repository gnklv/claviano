<script setup lang="ts">
import { computed } from 'vue';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import { THEME_SETTINGS, type ThemeSetting } from '../theme/resolveTheme';
import { useTheme } from '../theme/useTheme';
import SegmentedControl from './SegmentedControl.vue';

/** U+FE0E asks for the plain text glyph instead of a colored emoji. */
const ICONS: Record<ThemeSetting, string> = { auto: '◐', light: '☀︎', dark: '☾' };
const TITLES: Record<ThemeSetting, MessageKey> = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' };

const { t } = useI18n();
const { setting } = useTheme();
const options = computed(() =>
  THEME_SETTINGS.map((value) => ({ value, label: ICONS[value], title: t(TITLES[value]) })),
);
</script>

<template>
  <SegmentedControl v-model="setting" :options="options" :label="t('theme')" />
</template>
