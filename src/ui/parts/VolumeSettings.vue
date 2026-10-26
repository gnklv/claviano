<script setup lang="ts">
import AppSlider from '../components/AppSlider.vue';
import SettingRow from '../components/SettingRow.vue';
import type { SoundPart } from '../../application/ports/AudioOutput';
import { useMirror } from '../app/useMirror';
import { useDeps } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

/* How loud the notes and the metronome are: two sliders, for the balance between them. */

const PARTS: readonly { part: SoundPart; label: MessageKey }[] = [
  { part: 'instrument', label: 'volumeNotes' },
  { part: 'metronome', label: 'volumeMetronome' },
];

const { t } = useI18n();
const { volume } = useDeps();
const percent = (part: SoundPart) => Math.round(volume.of(part) * 100);
const levels = useMirror(volume, () => ({ instrument: percent('instrument'), metronome: percent('metronome') }));

function set(part: SoundPart, percent: number): void {
  volume.set(part, percent / 100);
}
</script>

<template>
  <SettingRow v-for="{ part, label } in PARTS" :key="part" tag="label" :label="t(label)">
    <AppSlider :step="5" :model-value="levels[part]" @update:model-value="set(part, $event)" />
    <output class="value">{{ levels[part] }}%</output>
  </SettingRow>
</template>

<style scoped>
/*
 * Under its words and its percentage, the row's whole width: two levels one under the other start
 * and end level, whatever their words (beside them, each had what its words left, in Russian as
 * little as 60 px for the metronome's).
 */
.slider {
  flex-basis: 100%;
  order: 1;
}

.value {
  min-width: 4ch;
  color: var(--muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
