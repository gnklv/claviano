<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import AppIcon from '../components/AppIcon.vue';
import PassDots from '../components/PassDots.vue';
import { computed, ref, useTemplateRef } from 'vue';
import { PASSES_TO_DONE } from '../../application/use-cases/PracticePlan';
import type { PlanStep } from '../../domain/practice/plan';
import { usePracticePlan } from '../app/usePracticePlan';
import { useStepWords } from '../app/useStepWords';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * The plan's steps, under the bars they are played in: those done ticked, the one being played with
 * its clean passes. A press begins a step (and the list is done with). The plan may be begun again,
 * once one is sure: what is done of it is a long work.
 */
const emit = defineEmits<{ done: [] }>();

const { plan, playback } = useDeps();
const { t } = useI18n();
const state = usePracticePlan(plan);
const words = useStepWords(playback);

/** The steps by the bars they are played in, in order: a part's steps together, a join or the whole each by itself. */
const groups = computed(() => {
  const found: { bars: string; steps: { step: PlanStep; index: number }[] }[] = [];
  let last: PlanStep | undefined;
  state.value.steps.forEach((step, index) => {
    if (!last || last.from !== step.from || last.to !== step.to) found.push({ bars: words.bars(step), steps: [] });
    found.at(-1)!.steps.push({ step, index });
    last = step;
  });
  return found;
});

function begin(index: number): void {
  plan.start(index);
  emit('done');
}

const sure = ref(false);
function restart(): void {
  if (!sure.value) {
    sure.value = true;
    return;
  }
  sure.value = false;
  plan.restart();
}

const list = useTemplateRef<HTMLElement>('list');
/** Brings the step being played into sight, or the next one: in a plan of a hundred steps it is far down. */
function showWhereOneIs(): void {
  sure.value = false;
  list.value?.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'center' });
}
defineExpose({ showWhereOneIs });
</script>

<template>
  <div ref="list" class="plan">
    <section v-for="(group, at) in groups" :key="at" class="group">
      <h3 class="bars">{{ group.bars }}</h3>
      <AppButton
        v-for="{ step, index } in group.steps"
        :key="index"
        variant="quiet"
        class="step"
        :class="{ done: state.done.has(index) }"
        :label="state.done.has(index) ? `${words.what(step)} · ${t('stepDone')}` : undefined"
        :aria-current="index === (state.current ?? state.next) ? 'step' : undefined"
        @click="begin(index)"
      >
        <AppIcon class="tick" :class="{ hidden: !state.done.has(index) }" name="check" small />
        <span class="what">{{ words.what(step) }}</span>
        <PassDots v-if="index === state.current" :count="state.clean" :of="PASSES_TO_DONE" :label="t('stepCleanCount', { count: state.clean, of: PASSES_TO_DONE })" />
      </AppButton>
    </section>
    <AppButton v-if="state.done.size > 0" class="restart" @click="restart">{{ t(sure ? 'planRestartConfirm' : 'planRestart') }}</AppButton>
  </div>
</template>

<style scoped>
.plan {
  display: grid;
  gap: var(--space-3);
}

.group {
  display: grid;
  gap: var(--space-1);
}

.bars {
  margin: 0 0 var(--space-1);
  color: var(--muted);
  font-size: var(--text-s);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
}

.step {
  justify-content: flex-start;
  width: 100%;
}

.step :deep(.words) {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
}

.what {
  flex: 1;
  text-align: start;
}

/* (A tick's room is kept where there is none, so that the steps' words stand in one column.) */
.tick.hidden {
  visibility: hidden;
}

.done .what {
  color: var(--muted);
}

/* The step being played, or the one to play next: where one is in the plan. */
.step[aria-current] .what {
  font-weight: var(--title-weight);
}

.restart {
  justify-self: start;
}
</style>
