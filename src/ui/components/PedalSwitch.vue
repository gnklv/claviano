<script setup lang="ts">
import { computed } from 'vue';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

type PedalSetting = 'on' | 'off';

/** Turning the pedal off helps to hear whether the fingers alone play legato. */
const { t } = useI18n();
const { playback } = useDeps();
const state = usePlaybackState(playback);
const setting = computed<PedalSetting>({
  get: () => (state.value.pedal ? 'on' : 'off'),
  set: (value) => playback.setPedalEnabled(value === 'on'),
});
const options = computed(() => [
  { value: 'on' as const, label: t('pedalOn') },
  { value: 'off' as const, label: t('pedalOff') },
]);
</script>

<template>
  <SegmentedControl v-model="setting" :options="options" :label="t('pedal')" />
</template>
