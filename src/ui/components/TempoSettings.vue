<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import type { TempoReading } from '../tempoReading';
import TempoMark from './TempoMark.vue';
import { computed } from 'vue';
import { PRACTICE_TEMPO, stepTempo } from '../../application/use-cases/stepTempo';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * Setting the tempo, the way a video player sets its speed: the tempo in large figures between a
 * "slower" and a "faster" button (a step each, to land on a tempo without aiming), a slider for
 * going far, and the tempos pieces are most often learned at, a touch away.
 */

/** `mark`: the tempo this makes, as the page would write it (a quarter = 96); none where the piece has no tempo mark. */
defineProps<{ mark: TempoReading | null }>();

/** The tempos a piece is learned at, in percent: nobody practises faster than written. */
const PRESETS = [50, 60, 70, 80, 90, 100];
const percentOf = (tempo: number) => Math.round(tempo * 100);
const RANGE = { min: percentOf(PRACTICE_TEMPO.min), max: percentOf(PRACTICE_TEMPO.max), step: percentOf(PRACTICE_TEMPO.step) };

const { playback } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const percent = computed({
  get: () => percentOf(state.value.tempo),
  set: (value: number) => playback.setTempo(value / 100),
});
</script>

<template>
  <div class="tempo-settings">
    <div class="now">
      <button class="button step" :disabled="percent <= RANGE.min" :title="t('tempoSlower')" :aria-label="t('tempoSlower')" @click="stepTempo(playback, -1)"><AppIcon name="minus" /></button>
      <output class="readout">
        <strong class="percent">{{ percent }}%</strong>
        <span class="mark"><TempoMark v-if="mark" v-bind="mark" /><template v-else>&nbsp;</template></span>
      </output>
      <button class="button step" :disabled="percent >= RANGE.max" :title="t('tempoFaster')" :aria-label="t('tempoFaster')" @click="stepTempo(playback, 1)"><AppIcon name="plus" /></button>
    </div>
    <input
      v-model.number="percent"
      class="slider"
      type="range"
      :min="RANGE.min"
      :max="RANGE.max"
      :step="RANGE.step"
      :aria-label="t('tempo')"
      :style="{ '--fill': `${((percent - RANGE.min) / (RANGE.max - RANGE.min)) * 100}%` }"
    />
    <div class="presets">
      <button v-for="preset in PRESETS" :key="preset" class="toggle preset" :aria-pressed="percent === preset" @click="percent = preset">
        {{ preset }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tempo-settings {
  display: grid;
  gap: 12px;
}

.now {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.step {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
}

.readout {
  display: grid;
  justify-items: center;
  font-variant-numeric: tabular-nums;
}

.percent {
  font-size: var(--text-xl);
  line-height: 1.2;
}

.mark {
  color: var(--muted);
  white-space: nowrap;
}

.slider {
  width: 100%;
  margin: 0;
}

.presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.preset {
  justify-content: center;
  padding-inline: 0;
  font-variant-numeric: tabular-nums;
}
</style>
