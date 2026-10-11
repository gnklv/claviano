<script setup lang="ts">
import { computed } from 'vue';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import type { IconName } from '../icons/icons';
import { THEME_SETTINGS, type ThemeSetting } from '../theme/resolveTheme';
import { useTheme } from '../theme/useTheme';
import SegmentedControl from './SegmentedControl.vue';

const ICONS: Record<ThemeSetting, IconName> = { auto: 'auto', light: 'sun', dark: 'moon' };
const TITLES: Record<ThemeSetting, MessageKey> = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' };

const { t } = useI18n();
const { setting } = useTheme();
const options = computed(() =>
  THEME_SETTINGS.map((value) => ({ value, label: t(TITLES[value]), icon: ICONS[value] })),
);
</script>

<template>
  <SegmentedControl v-model="setting" :options="options" :label="t('theme')" />
</template>
