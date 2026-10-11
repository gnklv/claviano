<script setup lang="ts">
import SettingRow from './SettingRow.vue';
import type { SoundPart } from '../../application/ports/AudioOutput';
import { useMirror } from '../composables/useMirror';
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

function set(part: SoundPart, event: Event): void {
  volume.set(part, Number((event.target as HTMLInputElement).value) / 100);
}
</script>

<template>
  <SettingRow v-for="{ part, label } in PARTS" :key="part" tag="label" :label="t(label)">
    <input class="slider" type="range" min="0" max="100" step="5" :value="levels[part]" :style="{ '--fill': `${levels[part]}%` }" @input="set(part, $event)" />
    <output class="value">{{ levels[part] }}%</output>
  </SettingRow>
</template>

<style scoped>
/* (No shorter than can be aimed at.) */
.slider {
  flex: 1;
  min-width: 80px;
}

.value {
  min-width: 4ch;
  color: var(--muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
