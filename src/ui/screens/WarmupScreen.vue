<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { exercisesFor, type ExerciseHands, type ExerciseId, type ExerciseLevel } from '../../domain/exercises/catalog';
import { planWarmup, type WarmupMinutes } from '../../domain/exercises/warmup';
import { useDeps } from '../deps';
import { useWarmupState } from '../app/useWarmupState';
import { useExerciseWords } from '../app/useExerciseWords';
import { useI18n } from '../i18n/useI18n';
import AppButton from '../components/AppButton.vue';
import AppNotice from '../components/AppNotice.vue';
import ExerciseSequence from '../components/ExerciseSequence.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import ToggleChip from '../components/ToggleChip.vue';
import TempoMark from '../components/TempoMark.vue';

const emit = defineEmits<{ back: [] }>();
const props = defineProps<{ prepare?: boolean }>();
const { warmup } = useDeps();
const { t } = useI18n();
const words = useExerciseWords();
const session = useWarmupState(warmup);
const choosing = ref(props.prepare ?? false);
const mode = ref<'warmup' | 'exercise'>('warmup');
const level = ref<ExerciseLevel>('beginner');
const minutes = ref<WarmupMinutes>(5);
const exerciseId = ref<ExerciseId>('five-notes');
const hands = ref<ExerciseHands>('right');
const exercises = computed(() => exercisesFor(level.value));
const chosen = computed(() => exercises.value.find(exercise => exercise.id === exerciseId.value) ?? exercises.value[0]!);
watch(chosen, exercise => {
  exerciseId.value = exercise.id;
  if (!exercise.hands.includes(hands.value)) hands.value = exercise.hands[0]!;
}, { flush: 'sync' });
const modes = computed(() => [{ value: 'warmup' as const, label: t('warmupWarmup') }, { value: 'exercise' as const, label: t('warmupOne') }]);
const levels = computed(() => (['beginner', 'intermediate', 'advanced'] as const).map(value => ({ value, label: words.level(value) })));
const handChoices = computed(() => chosen.value.hands.map(value => ({ value, label: words.hands(value) })));
const steps = computed(() => planWarmup(level.value, minutes.value).steps);
function open(): void {
  choosing.value = false;
  if (mode.value === 'warmup') warmup.start(level.value, minutes.value);
  else warmup.startExercise(chosen.value.id, hands.value);
}
</script>

<template>
  <div class="warmup">
    <ScreenHeader back @back="emit('back')"><template #title>{{ t('warmupTitle') }}</template></ScreenHeader>
    <main class="page">
      <section v-if="session.status === 'finished' && !choosing" class="finished">
        <h1>{{ t(session.selection?.mode === 'exercise' ? 'exerciseFinished' : 'warmupFinished') }}</h1>
        <AppNotice>{{ t('warmupFinishedNote') }}</AppNotice>
        <div class="choices">
          <AppButton variant="primary" @click="emit('back')">{{ t('warmupBack') }}</AppButton>
          <AppButton @click="warmup.restart()">{{ t(session.selection?.mode === 'exercise' ? 'exerciseRepeat' : 'warmupRepeat') }}</AppButton>
          <AppButton @click="choosing = true">{{ t('warmupChoose') }}</AppButton>
        </div>
      </section>
      <div v-else class="preparation">
        <section class="settings">
          <h1>{{ t('warmupTitle') }}</h1>
          <SegmentedControl v-model="mode" wide :options="modes" :label="t('warmupMode')" />
          <div class="field"><h2>{{ t('warmupLevel') }}</h2><div class="choices" role="group" :aria-label="t('warmupLevel')"><ToggleChip v-for="option in levels" :key="option.value" :pressed="level === option.value" @update:pressed="level = option.value">{{ option.label }}</ToggleChip></div><AppNotice>{{ words.levelHint(level) }}</AppNotice><p>{{ t('warmupKey') }}</p></div>
          <div v-if="mode === 'warmup'" class="field">
            <h2>{{ t('warmupDuration') }}</h2>
            <div class="choices"><ToggleChip v-for="duration in ([5, 10, 15] as const)" :key="duration" :pressed="minutes === duration" :aria-label="t('warmupMinutes', { count: duration })" @update:pressed="minutes = duration">{{ t('warmupMinutesShort', { count: duration }) }}</ToggleChip></div>
            <AppNotice>{{ t('warmupFamiliarNote') }}</AppNotice>
          </div>
          <template v-else>
            <div class="field"><h2>{{ t('warmupTask') }}</h2><div class="catalog"><ToggleChip v-for="exercise in exercises" :key="exercise.id" :pressed="chosen.id === exercise.id" @update:pressed="exerciseId = exercise.id">{{ words.title(exercise.id) }}</ToggleChip></div></div>
            <div class="field"><h2>{{ t('warmupHands') }}</h2><SegmentedControl v-model="hands" wide :options="handChoices" :label="t('warmupHands')" /></div>
          </template>
          <AppButton class="open-session" :class="{ 'after-details': mode === 'exercise' }" variant="primary" @click="open">{{ t(mode === 'warmup' ? 'warmupOpen' : 'exerciseOpen') }}</AppButton>
        </section>
        <section v-if="mode === 'warmup'" class="planned"><h2>{{ t('warmupSequence') }}</h2><ExerciseSequence :rows="words.sequence(steps)" :label="t('warmupSequence')" /><AppNotice>{{ t('warmupEstimateNote') }}</AppNotice></section>
        <section v-else class="task">
          <h2>{{ words.title(chosen.id) }}</h2>
          <p>{{ words.goal(chosen.id) }}</p>
          <p>{{ t('warmupStartingTempo') }}: <TempoMark unit="quarter" :dotted="false" :per-minute="chosen.tempo" /> · {{ words.hands(hands) }} · {{ words.repetitions(1) }}</p>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.warmup { display: grid; grid-template-rows: auto 1fr; height: 100%; min-height: 0; }
.page { overflow-y: auto; padding: var(--space-5) var(--space-4); }
.preparation, .finished { max-width: var(--column-width); margin-inline: auto; }
.preparation { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-6); align-items: start; }
.settings, .field, .planned, .finished { display: grid; gap: var(--space-3); }
h1 { margin: 0; font-family: var(--font-title); font-size: var(--text-xl); font-weight: var(--title-weight); }
h2 { margin: 0; font-size: var(--text-m); font-weight: var(--title-weight); }
p { margin-block: var(--space-2); color: var(--muted); line-height: 1.5; }
.choices { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.catalog { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.task { padding: var(--space-3); border: var(--edge) solid var(--border); border-radius: var(--radius-m); }
@media (max-width: 599px) {
  .preparation { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-3); }
  /* Read one task before opening it; a warm-up need not scroll past the whole queue to start. */
  .settings { display: contents; }
  .planned, .task { margin-top: var(--space-3); }
  .open-session.after-details { order: 1; }
}
</style>
