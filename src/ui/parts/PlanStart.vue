<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import PlanList from './PlanList.vue';
import { computed, useTemplateRef } from 'vue';
import { usePracticePlan } from '../app/usePracticePlan';
import { useStepWords } from '../app/useStepWords';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * The plan before a step is begun: how long it is, or the step it goes on with, or that it is done;
 * the words open the list of every step, and a button begins the next. Over the transport, and on a
 * phone in the practice sheet. A step begun, here or from the list, is told (`began`).
 */
const emit = defineEmits<{ began: [] }>();

const { plan, playback } = useDeps();
const { t } = useI18n();
const state = usePracticePlan(plan);
const words = useStepWords(playback);

const said = computed(() => {
  const { steps, next, done } = state.value;
  if (next === null) return t('planDone');
  // (Not yet begun: how long the plan is. Begun: where it goes on.)
  return done.size === 0 ? t('planSteps', { count: steps.length }) : t('planNext', { step: words.whole(steps[next]!) });
});

const list = useTemplateRef<InstanceType<typeof PlanList>>('list');
function begin(index: number): void {
  plan.start(index);
  emit('began');
}
</script>

<template>
  <div class="plan-start">
    <AppButton class="said" variant="quiet" pill :hint="t('plan')" @click="list?.open()"><span class="reading">{{ said }}</span></AppButton>
    <AppButton v-if="state.next !== null" class="begin" pill @click="begin(state.next)">{{ t('planStart') }}</AppButton>
    <PlanList ref="list" @began="emit('began')" />
  </div>
</template>

<style scoped>
/*
 * It begins with a quiet button, whose words stand a padding in from its edge: so it begins a
 * padding before the edge it is set against, and its words stand on that edge, over the transport's
 * play button, and in the practice sheet in line with the chips under them (as the step being played
 * stands, see StepBar). Its own edge, not the button's margin, nor the sheet's or the bar's room.
 */
.plan-start {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  margin-inline-start: calc(-1 * var(--space-3));
}

/* The words give way first, cut short (as a button's words are); never the button. */
.said {
  flex: 0 1 auto;
  min-width: 0;
}

/* (Read, not passed over: it is where one is in the plan. Quiet only in that it has no face.) */
.reading {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.begin {
  flex: none;
}
</style>
