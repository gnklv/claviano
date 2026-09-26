<script setup lang="ts">
import { computed } from 'vue';
import { VIEW_MODES, useViewMode, type ViewMode } from '../composables/useViewMode';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

const LABELS: Record<ViewMode, MessageKey> = {
  staff: 'viewStaff',
  keys: 'viewKeys',
  both: 'viewBoth',
};

const { t } = useI18n();
const mode = useViewMode();
const options = computed(() => VIEW_MODES.map((value) => ({ value, label: t(LABELS[value]) })));
</script>

<template>
  <SegmentedControl v-model="mode" :options="options" :label="t('viewMode')" />
</template>
