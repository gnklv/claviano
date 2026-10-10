<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import type { SoundPart } from '../../application/ports/AudioOutput';
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
const levels = ref({ instrument: percent('instrument'), metronome: percent('metronome') });
onScopeDispose(volume.onChange(() => (levels.value = { instrument: percent('instrument'), metronome: percent('metronome') })));

function set(part: SoundPart, event: Event): void {
  volume.set(part, Number((event.target as HTMLInputElement).value) / 100);
}
</script>

<template>
  <label v-for="{ part, label } in PARTS" :key="part" class="row">
    <span class="label">{{ t(label) }}</span>
    <input class="slider" type="range" min="0" max="100" step="5" :value="levels[part]" @input="set(part, $event)" />
    <output class="value">{{ levels[part] }}%</output>
  </label>
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
