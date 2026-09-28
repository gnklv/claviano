<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

defineProps<{
  /** Accessible name of the switch. */
  label: string;
}>();

const model = defineModel<boolean>({ required: true });
const { t } = useI18n();
const setting = computed<'on' | 'off'>({
  get: () => (model.value ? 'on' : 'off'),
  set: (value) => (model.value = value === 'on'),
});
const options = computed(() => [
  { value: 'on' as const, label: t('on') },
  { value: 'off' as const, label: t('off') },
]);
</script>

<template>
  <SegmentedControl v-model="setting" :options="options" :label="label" />
</template>
