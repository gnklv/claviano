<script setup lang="ts">
import { computed } from 'vue';
import { tempoMarkAt, writtenBeatAt } from '../../domain/score';
import { useFrameValue } from '../browser/useFrameValue';
import { usePlaybackState } from '../app/usePlaybackState';
import { useTrainer } from '../app/useTrainer';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import PanelControl from '../components/PanelControl.vue';
import type { TempoReading } from '../components/tempoReading';
import TempoMark from '../components/TempoMark.vue';
import TempoSettings from './TempoSettings.vue';

/*
 * The tempo in the transport bar: a button that says what it is (80%, and a quarter = 96), and behind it
 * the means of setting it (see PanelControl).
 */

const { playback, trainer } = useDeps();
const training = useTrainer(trainer);
/** Where the trainer is taking the tempo, in percent; null while it is off. */
const aim = computed(() => (training.value.on ? Math.round(training.value.plan.to * 100) : null));
const { t } = useI18n();
const state = usePlaybackState(playback);
const percent = computed(() => Math.round(state.value.tempo * 100));

/** The tempo mark in force where the music is. */
const written = useFrameValue(() => {
  const score = playback.score;
  return score && tempoMarkAt(score, writtenBeatAt(score, playback.position));
});
/** The tempo the music is played at now, the setting applied: 45 at 50% of a written 90. None without a tempo mark. */
const mark = computed<TempoReading | null>(() => {
  const at = written.value;
  return at ? { unit: at.unit.value, dotted: at.unit.dots > 0, perMinute: Math.round(at.perMinute * state.value.tempo) } : null;
});

</script>

<template>
  <PanelControl class="tempo" :title="t('tempo')" :label="`${t('tempo')}: ${percent}%`">
    {{ percent }}%<span v-if="aim !== null" class="aim">{{ t('trainerAim', { to: aim }) }}</span><span v-if="mark" class="mark"> · <TempoMark v-bind="mark" /></span>
    <template #panel><TempoSettings :mark="mark" /></template>
  </PanelControl>
</template>

<style scoped>
.mark,
.aim {
  color: var(--muted);
}

.aim {
  margin-left: var(--space-1);
}

/* Where the bar is tight, the percent alone: what it makes, and where the trainer takes it, are in the panel. */
@media (max-width: 599px) {
  .mark,
  .aim {
    display: none;
  }
}
</style>
