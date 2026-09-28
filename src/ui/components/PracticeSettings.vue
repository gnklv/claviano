<script setup lang="ts">
import { computed } from 'vue';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import OnOffSwitch from './OnOffSwitch.vue';

/*
 * Settings for practising, as rows of "label — On/Off":
 * the pedals (off, to hear whether the fingers alone play legato) and the count-in before playing.
 */
const { t } = useI18n();
const { playback } = useDeps();
const state = usePlaybackState(playback);
const pedal = computed({ get: () => state.value.pedal, set: (on: boolean) => playback.setPedalEnabled(on) });
const countIn = computed({ get: () => state.value.countIn, set: (on: boolean) => playback.setCountInEnabled(on) });
</script>

<template>
  <div class="row">
    <span class="label">{{ t('pedal') }}</span>
    <OnOffSwitch v-model="pedal" :label="t('pedal')" />
  </div>
  <div class="row">
    <span class="label">{{ t('countIn') }}</span>
    <OnOffSwitch v-model="countIn" :label="t('countIn')" />
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.label {
  color: var(--muted);
}
</style>
