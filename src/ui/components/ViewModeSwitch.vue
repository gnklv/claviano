<script setup lang="ts">
import { computed } from 'vue';
import { useOfferedViewModes, useShownViewMode, type ViewMode } from '../kept/useViewMode';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

const LABELS: Record<ViewMode, MessageKey> = {
  staff: 'viewStaff',
  keys: 'viewKeys',
  both: 'viewBoth',
};

const { t } = useI18n();
const mode = useShownViewMode();
const offered = useOfferedViewModes();
const options = computed(() => offered.value.map((value) => ({ value, label: t(LABELS[value]) })));
</script>

<template>
  <SegmentedControl v-model="mode" :options="options" :label="t('viewMode')" />
</template>
