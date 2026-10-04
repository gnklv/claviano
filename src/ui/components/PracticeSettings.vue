<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import OnOffSwitch from './OnOffSwitch.vue';
import SegmentedControl from './SegmentedControl.vue';

/*
 * Settings for practising, as rows of "label — choice": the pedals (off, to hear whether the
 * fingers alone play legato), the count-in before playing, and the sound (the sampled piano, or
 * the plain synth that needs nothing fetched).
 */
type Sound = 'piano' | 'synth';

const { t } = useI18n();
const { playback, instrument } = useDeps();
const state = usePlaybackState(playback);
const pedal = computed({ get: () => state.value.pedal, set: (on: boolean) => playback.setPedalEnabled(on) });
const countIn = computed({ get: () => state.value.countIn, set: (on: boolean) => playback.setCountInEnabled(on) });

const pianoOn = ref(instrument.enabled);
onScopeDispose(instrument.onChange(() => (pianoOn.value = instrument.enabled)));
const sound = computed<Sound>({
  get: () => (pianoOn.value ? 'piano' : 'synth'),
  set: (value) => instrument.setEnabled(value === 'piano'),
});
const sounds = computed((): { value: Sound; label: string }[] => [
  { value: 'piano', label: t('soundPiano') },
  { value: 'synth', label: t('soundSynth') },
]);
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
  <div class="row">
    <span class="label">{{ t('sound') }}</span>
    <SegmentedControl v-model="sound" :options="sounds" :label="t('sound')" />
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
