<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import MenuList from '../components/MenuList.vue';
import PassDots from '../components/PassDots.vue';
import PlanPanel from './PlanPanel.vue';
import PopOver from '../components/PopOver.vue';
import SheetDialog from '../components/SheetDialog.vue';
import { computed, ref, useTemplateRef, watch } from 'vue';
import { PASSES_TO_DONE } from '../../application/use-cases/PracticePlan';
import { usePracticePlan } from '../app/usePracticePlan';
import { useStepWords } from '../app/useStepWords';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * The plan over the transport, while a piece is learnt. A step being played: what it is and its
 * clean passes in a row; under them, the two words said after each pass, as wide as can be pressed
 * without looking; what else can be done with the step behind "⋯". What to do is said until the
 * first pass is marked. None: the step to play next, to begin. The words open the list of every
 * step.
 */
const { plan, playback } = useDeps();
const { t } = useI18n();
const state = usePracticePlan(plan);
const words = useStepWords(playback);

const playing = computed(() => (state.value.current === null ? null : state.value.steps[state.value.current]!));
const said = computed(() => {
  const { steps, next, done } = state.value;
  if (playing.value) return words.whole(playing.value);
  if (next === null) return t('planDone');
  // (Not yet begun: how long the plan is. Begun: where it goes on.)
  return done.size === 0 ? t('planSteps', { count: steps.length }) : t('planNext', { step: words.whole(steps[next]!) });
});

/** A pass of this step has been marked: what to do is known. */
const marked = ref(false);
watch(
  () => state.value.current,
  () => (marked.value = false),
);
function mark(clean: boolean): void {
  marked.value = true;
  if (clean) plan.clean();
  else plan.missed();
}

const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const list = useTemplateRef<InstanceType<typeof PlanPanel>>('list');
function openList(): void {
  sheet.value?.open();
  list.value?.showWhereOneIs();
}

const menu = ref(false);
const actions = computed(() => [
  { id: 'all', label: t('planAll') },
  { id: 'skip', label: t('stepSkip') },
  { id: 'leave', label: t('stepLeave') },
]);
function choose(action: string): void {
  menu.value = false;
  if (action === 'all') openList();
  else if (action === 'skip') plan.finish();
  else plan.stop();
}
</script>

<template>
  <div v-if="state.steps.length > 0" class="step-bar" :class="{ playing }">
    <AppButton class="said" variant="quiet" :hint="t('plan')" @click="openList">{{ said }}</AppButton>
    <template v-if="playing">
      <PassDots class="dots" :count="state.clean" :of="PASSES_TO_DONE" :label="t('stepCleanCount', { count: state.clean, of: PASSES_TO_DONE })" />
      <div class="marks">
        <AppButton @click="mark(false)">{{ t('stepSlip') }}</AppButton>
        <AppButton @click="mark(true)">{{ t('stepClean') }}</AppButton>
      </div>
      <PopOver v-model:open="menu" class="more" place="above-end" role="menu" :label="t('stepActions')">
        <AppButton variant="quiet" icon="more" :label="t('stepActions')" :aria-expanded="menu" @click="menu = !menu" />
        <template #panel><MenuList :items="actions" @choose="choose" /></template>
      </PopOver>
      <p v-if="!marked" class="how">{{ t('stepHow', { of: PASSES_TO_DONE }) }}</p>
    </template>
    <AppButton v-else-if="state.next !== null" class="begin" @click="plan.start(state.next)">{{ t('planStart') }}</AppButton>
    <SheetDialog ref="sheet" :title="t('plan')">
      <PlanPanel ref="list" @done="sheet?.close()" />
    </SheetDialog>
  </div>
</template>

<style scoped>
/*
 * One row, read from the left as one thing: what the step is, its passes, the two words, "⋯"; what
 * to do said in the room left after them (under them, where there is none). Not spread to the two
 * edges: the eye would cross the bar between what is played and how it went. (Not yet begun: what
 * the plan is, and the button that begins it, beside it.)
 */
.step-bar {
  display: grid;
  grid-template-columns: minmax(0, max-content) auto 1fr;
  grid-template-areas: 'said begin .';
  align-items: center;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) var(--space-2) max(var(--space-4), env(safe-area-inset-left));
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.step-bar.playing {
  grid-template-columns: minmax(0, max-content) auto auto auto minmax(0, 1fr);
  grid-template-areas: 'said dots marks more how';
}

/* (Too narrow for what to do beside the rest: under it.) */
@media (max-width: 999px) {
  .step-bar.playing {
    grid-template-areas:
      'said dots marks more .'
      'how how how how how';
  }
}

/* The words give way first: cut short, they never push the buttons out of the row. */
.said {
  grid-area: said;
  min-width: 0;
  justify-content: flex-start;
  /* (Read, not passed over: the step is what one is playing. Quiet only in that it has no face.) */
  color: var(--text);
}

.said :deep(.words) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.begin {
  grid-area: begin;
  white-space: nowrap;
}

.dots {
  grid-area: dots;
}

.marks {
  grid-area: marks;
  display: flex;
  gap: var(--space-2);
}

.marks .button {
  white-space: nowrap;
}

.more {
  grid-area: more;
}

.how {
  grid-area: how;
  margin: 0;
  padding-inline: var(--space-3);
  overflow: hidden;
  color: var(--muted);
  font-size: var(--text-s);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * A phone: what the step is, its passes and "⋯" on top; under them the two words, each half the
 * width, to be pressed after a pass without aiming.
 */
@media (max-width: 599px) {
  .step-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'said begin';
  }

  .step-bar.playing {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'said dots more'
      'marks marks marks'
      'how how how';
  }

  .marks .button {
    flex: 1 1 0;
  }
}

/* A phone on its side: every line of height is the music's; one row, and what to do is not said. */
@media (max-height: 500px) {
  .how {
    display: none;
  }

  .step-bar.playing {
    grid-template-columns: minmax(0, max-content) auto auto auto 1fr;
    grid-template-areas: 'said dots marks more .';
  }
}
</style>
