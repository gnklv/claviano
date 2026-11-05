<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue';
import { exerciseById } from '../../domain/exercises/catalog';
import AppButton from '../components/AppButton.vue';
import ExerciseSequence from '../components/ExerciseSequence.vue';
import SheetDialog from '../components/SheetDialog.vue';
import TempoMark from '../components/TempoMark.vue';
import { useExerciseWords } from '../app/useExerciseWords';
import { useWarmupState } from '../app/useWarmupState';
import { NARROW_SCREEN, useMediaQuery } from '../browser/useMediaQuery';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

const { warmup } = useDeps();
const state = useWarmupState(warmup);
const words = useExerciseWords();
const { t } = useI18n();
const narrow = useMediaQuery(NARROW_SCREEN);
const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const last = computed(() => state.value.current === state.value.steps.length - 1);
const single = computed(() => state.value.selection?.mode === 'exercise');
const task = computed(() => state.value.step ? exerciseById(state.value.step.exerciseId) : null);
watch(() => state.value.current, () => { sheet.value?.close(); });

function finish(): void {
  sheet.value?.close();
  warmup.finish();
}
</script>

<template>
  <div v-if="state.step && task" class="warmup-task">
    <span v-if="!single" class="progress" :aria-label="t('warmupProgress', { count: (state.current ?? 0) + 1, of: state.steps.length })">{{ (state.current ?? 0) + 1 }} / {{ state.steps.length }}</span>
    <AppButton class="task-name" icon="more" variant="quiet" pill :hint="t(single ? 'exerciseDetails' : 'warmupSequence')" aria-haspopup="dialog" @click="sheet?.open()">
      <span class="reading">{{ words.title(state.step.exerciseId) }}</span>
    </AppButton>
    <span class="hand">
      {{ words.hands(state.step.hands) }}
      <span v-if="narrow && !single" class="short-repetitions" :aria-label="words.repetitions(state.step.repetitions)">{{ t('warmupRepeatShort', { count: state.step.repetitions }) }}</span>
    </span>
    <span class="repetitions">{{ words.repetitions(state.step.repetitions) }}</span>
    <AppButton v-if="last" pill :label="t(single ? 'exerciseFinish' : 'warmupFinish')" @click="finish">{{ t(narrow ? 'warmupFinishShort' : single ? 'exerciseFinish' : 'warmupFinish') }}</AppButton>
    <AppButton v-else pill :label="t('warmupNext')" @click="warmup.next()">{{ t(narrow ? 'warmupNextShort' : 'warmupNext') }}</AppButton>
    <SheetDialog ref="sheet" :title="t(single ? 'exerciseDetails' : 'warmupSequence')">
      <h2 class="task-title">{{ words.title(state.step.exerciseId) }}</h2>
      <p class="goal">{{ words.goal(state.step.exerciseId) }}</p>
      <p class="detail">{{ words.hands(state.step.hands) }} · {{ words.repetitions(state.step.repetitions) }}</p>
      <p class="detail">{{ t('warmupStartingTempo') }} <TempoMark unit="quarter" :dotted="false" :per-minute="task.tempo" /></p>
      <ExerciseSequence v-if="!single" :rows="words.sequence(state.steps)" :current="state.current" :label="t('warmupSequence')" />
      <p v-if="!single" class="detail">{{ t('warmupEstimateNote') }}</p>
      <AppButton @click="finish">{{ t(single ? 'exerciseFinish' : last ? 'warmupFinish' : 'warmupFinishEarly') }}</AppButton>
    </SheetDialog>
  </div>
</template>

<style scoped>
.warmup-task {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-1) max(var(--space-4), env(safe-area-inset-right)) var(--space-1) max(var(--space-4), env(safe-area-inset-left));
  border-bottom: var(--edge) solid var(--border);
  background: var(--panel);
}

.progress,
.hand,
.repetitions,
.detail {
  color: var(--muted);
  font-size: var(--text-s);
  font-variant-numeric: tabular-nums;
}

.progress, .hand { flex: none; }
.hand { display: flex; flex-direction: column; }
.short-repetitions { font-size: var(--text-xs); }
.task-name { min-width: 0; }
.reading { color: var(--text); }
.repetitions { margin-inline-end: auto; }
.goal, .detail { margin: 0; }
.task-title {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--text-l);
  font-weight: var(--title-weight);
}

@media (max-width: 599px) {
  .task-name { flex: 1; }
  .repetitions { display: none; }
}
</style>
