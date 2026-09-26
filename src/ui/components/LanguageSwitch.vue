<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

const { locale, locales, t } = useI18n();
const options = computed(() => locales.map((value) => ({ value, label: value.toUpperCase() })));
</script>

<template>
  <SegmentedControl v-model="locale" :options="options" :label="t('language')" />
</template>
