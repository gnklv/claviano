<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import AppSlider from '../components/AppSlider.vue';
import AppNotice from '../components/AppNotice.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import SettingRow from '../components/SettingRow.vue';
import ToggleChip from '../components/ToggleChip.vue';
import type { TempoReading } from '../components/tempoReading';
import TempoMark from '../components/TempoMark.vue';
import { computed } from 'vue';
import { PRACTICE_TEMPO, stepTempo } from '../../application/use-cases/stepTempo';
import { TRAINER_PASSES, TRAINER_STEPS } from '../../application/use-cases/TempoTrainer';
import { useTrainer } from '../app/useTrainer';
import { usePlaybackState } from '../app/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * Setting the tempo, the way a video player sets its speed: the tempo in large figures between a
 * "slower" and a "faster" button (a step each, to land on a tempo without aiming), a slider for
 * going far, and the tempos pieces are most often learned at, a touch away. Under it, the tempo
 * trainer: the loop quickening by itself, from one tempo to another.
 */

/** `mark`: the tempo this makes, as the page would write it (a quarter = 96); none where the piece has no tempo mark. */
defineProps<{ mark: TempoReading | null }>();

/** The tempos a piece is learned at, in percent: nobody practises faster than written. */
const PRESETS = [50, 60, 70, 80, 90, 100];
const percentOf = (tempo: number) => Math.round(tempo * 100);
const RANGE = { min: percentOf(PRACTICE_TEMPO.min), max: percentOf(PRACTICE_TEMPO.max), step: percentOf(PRACTICE_TEMPO.step) };

const { playback, trainer } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const training = useTrainer(trainer);

// --- The trainer: where it begins and ends, by how much a step, after how many passes. ---

/** Where it begins and where it ends, in percent: from slow enough to read, to a little past the piece's own. */
const FROM = [40, 50, 60, 70, 80];
const TO = [90, 100, 110, 120];
const percents = (values: readonly number[]) => values.map((value) => ({ value: String(value), label: `${value}%` }));
const plan = (key: 'from' | 'to' | 'step') =>
  computed({
    get: () => String(Math.round(training.value.plan[key] * 100)),
    set: (value: string) => trainer.setPlan({ [key]: Number(value) / 100 }),
  });
const from = plan('from');
const to = plan('to');
const step = plan('step');
const every = computed({ get: () => String(training.value.plan.every), set: (value: string) => trainer.setPlan({ every: Number(value) }) });
const on = computed({ get: () => (training.value.on ? 'on' : 'off'), set: (value: string) => trainer.setEnabled(value === 'on') });
const percent = computed({
  get: () => percentOf(state.value.tempo),
  set: (value: number) => playback.setTempo(value / 100),
});
</script>

<template>
  <div class="tempo-settings">
    <div class="now">
      <AppButton class="step" icon="minus" :disabled="percent <= RANGE.min" :label="t('tempoSlower')" @click="stepTempo(playback, -1)" />
      <output class="readout">
        <strong class="percent">{{ percent }}%</strong>
        <span class="mark"><TempoMark v-if="mark" v-bind="mark" /><template v-else>&nbsp;</template></span>
      </output>
      <AppButton class="step" icon="plus" :disabled="percent >= RANGE.max" :label="t('tempoFaster')" @click="stepTempo(playback, 1)" />
    </div>
    <AppSlider v-model="percent" class="slider" :min="RANGE.min" :max="RANGE.max" :step="RANGE.step" :label="t('tempo')" />
    <div class="presets">
      <ToggleChip v-for="preset in PRESETS" :key="preset" class="preset" :pressed="percent === preset" @update:pressed="percent = preset">
        {{ preset }}
      </ToggleChip>
    </div>
    <div class="trainer">
      <SettingRow :label="t('trainer')">
        <SegmentedControl v-model="on" :label="t('trainer')" :options="[{ value: 'off', label: t('off') }, { value: 'on', label: t('on') }]" />
      </SettingRow>
      <template v-if="training.on">
        <SettingRow :label="t('trainerFrom')"><SegmentedControl v-model="from" :label="t('trainerFrom')" :options="percents(FROM)" /></SettingRow>
        <SettingRow :label="t('trainerTo')"><SegmentedControl v-model="to" :label="t('trainerTo')" :options="percents(TO)" /></SettingRow>
        <SettingRow :label="t('trainerStep')"><SegmentedControl v-model="step" :label="t('trainerStep')" :options="percents(TRAINER_STEPS.map((s) => Math.round(s * 100)))" /></SettingRow>
        <SettingRow :label="t('trainerEvery')">
          <SegmentedControl v-model="every" :label="t('trainerEvery')" :options="TRAINER_PASSES.map((n) => ({ value: String(n), label: String(n) }))" />
        </SettingRow>
        <AppNotice v-if="!state.loop">{{ t('trainerNeedsLoop') }}</AppNotice>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tempo-settings {
  display: grid;
  gap: var(--space-3);
}

.trainer {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.now {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.step {
  flex: none;
  width: var(--touch);
  height: var(--touch);
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
  gap: var(--space-2);
}

.preset {
  justify-content: center;
  padding-inline: 0;
  font-variant-numeric: tabular-nums;
}
</style>
