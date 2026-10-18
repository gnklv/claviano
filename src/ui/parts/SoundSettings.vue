<script setup lang="ts">
import SettingRow from '../components/SettingRow.vue';
import { computed } from 'vue';
import { useMirror } from '../composables/useMirror';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from '../components/SegmentedControl.vue';

/* What plays the notes: the sampled piano, or the plain synth that needs nothing fetched. */
type Sound = 'piano' | 'synth';

const { t } = useI18n();
const { instrument } = useDeps();

const pianoOn = useMirror(instrument, () => instrument.enabled);
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
  <SettingRow :label="t('sound')">
    <SegmentedControl v-model="sound" :options="sounds" :label="t('sound')" />
  </SettingRow>
</template>
