<script setup lang="ts">
import { computed } from 'vue';
import { useMirror } from '../composables/useMirror';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

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
