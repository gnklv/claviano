<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import MenuList from '../components/MenuList.vue';
import PassDots from '../components/PassDots.vue';
import PlanList from './PlanList.vue';
import PlanStart from './PlanStart.vue';
import PopOver from '../components/PopOver.vue';
import { computed, ref, useTemplateRef, watch } from 'vue';
import { PASSES_TO_DONE } from '../../application/use-cases/PracticePlan';
import { NARROW_SCREEN, SMALL_SCREEN, useMediaQuery } from '../browser/useMediaQuery';
import { usePracticePlan } from '../app/usePracticePlan';
import { useStepWords } from '../app/useStepWords';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * The plan over the transport, while a piece is learnt. A step being played: what it is and its
 * clean passes in a row; under them, the two words said after each pass, as wide as can be pressed
 * without looking; what else can be done with the step behind "⋯". What to do is said until the
 * first pass is marked. None: the plan before a step (PlanStart).
 *
 * A phone, held either way, has no room for a bar to begin from (upright, no width; on its side,
 * no height, the falling notes have little enough): the plan before a step is in the practice
 * sheet there (see TransportBar), and the bar stands only while a step is played. Upright, what to
 * do stands in the place of the step's name until a pass is marked (the name is in the transport
 * under it too: the loop's bars, the tempo); on its side the bar is one row, and says no more.
 */
const { plan, playback } = useDeps();
const { t } = useI18n();
const state = usePracticePlan(plan);
const words = useStepWords(playback);
const narrow = useMediaQuery(NARROW_SCREEN);
/** A phone, upright or on its side. */
const phone = useMediaQuery(SMALL_SCREEN);

const playing = computed(() => (state.value.current === null ? null : state.value.steps[state.value.current]!));
const shown = computed(() => state.value.steps.length > 0 && (playing.value !== null || !phone.value));

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

const list = useTemplateRef<InstanceType<typeof PlanList>>('list');
const menu = ref(false);
const actions = computed(() => [
  { id: 'all', label: t('planAll') },
  { id: 'skip', label: t('stepSkip') },
  { id: 'leave', label: t('stepLeave') },
]);
function choose(action: string): void {
  menu.value = false;
  if (action === 'all') list.value?.open();
  else if (action === 'skip') plan.finish();
  else plan.stop();
}
</script>

<template>
  <div v-if="shown" class="step-bar" :class="{ playing }">
    <template v-if="playing">
      <!-- (On a phone, what to do stands in the place of the step's name until a pass is marked.) -->
      <p v-if="narrow && !marked" class="how in-place">{{ t('stepHow', { of: PASSES_TO_DONE }) }}</p>
      <AppButton v-else class="said" variant="quiet" pill :hint="t('plan')" @click="list?.open()"><span class="reading">{{ words.whole(playing) }}</span></AppButton>
      <PassDots class="dots" :count="state.clean" :of="PASSES_TO_DONE" :label="t('stepCleanCount', { count: state.clean, of: PASSES_TO_DONE })" />
      <div class="marks">
        <AppButton class="mark" pill @click="mark(false)">{{ t('stepSlip') }}</AppButton>
        <AppButton class="mark" pill @click="mark(true)">{{ t('stepClean') }}</AppButton>
      </div>
      <PopOver v-model:open="menu" class="more" place="above-end" role="menu" :label="t('stepActions')">
        <AppButton variant="quiet" pill icon="more" :label="t('stepActions')" :aria-expanded="menu" @click="menu = !menu" />
        <template #panel><MenuList :items="actions" @choose="choose" /></template>
      </PopOver>
      <p v-if="!narrow && !marked" class="how">{{ t('stepHow', { of: PASSES_TO_DONE }) }}</p>
      <PlanList ref="list" />
    </template>
    <PlanStart v-else />
  </div>
</template>

<style scoped>
.step-bar {
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) var(--space-2) max(var(--space-4), env(safe-area-inset-left));
  border-top: var(--edge) solid var(--border);
  background: var(--panel);
}

/*
 * A step being played: one row, read from the left as one thing: what the step is, its passes, the
 * two words, "⋯"; what to do said in the room left after them (under them, where there is none).
 * Not spread to the two edges: the eye would cross the bar between what is played and how it went.
 *
 * Its first thing is a quiet button, whose words stand a padding in from its edge: the bar's own
 * edge at the start is short by as much, so that the words stand where the transport's play button
 * stands under them, and what starts a row without such a button stands in by as much itself. (Not
 * the button moved out by a margin: the column it is measured into would lose that much, and its
 * words be cut short for nothing.)
 */
.step-bar.playing {
  display: grid;
  grid-template-columns: minmax(0, max-content) auto auto auto minmax(0, 1fr);
  grid-template-areas: 'said dots marks more how';
  align-items: center;
  gap: var(--space-1) var(--space-3);
  padding-inline-start: calc(max(var(--space-4), env(safe-area-inset-left)) - var(--space-3));
}

/* (Too narrow for what to do beside the rest: under it. From 1000 px it fits beside a step's name whole, at the page's 16 px: measured on a step up to tempo; a longer name cuts it short.) */
@media (max-width: 999px) {
  .step-bar.playing {
    grid-template-areas:
      'said dots marks more .'
      'how how how how how';
  }
}

/* The words give way first: cut short (as a button's words are), they never push the buttons out of the row. */
.said {
  grid-area: said;
  min-width: 0;
}

/* (Read, not passed over: the step is what one is playing. Quiet only in that it has no face.) */
.reading {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.dots {
  grid-area: dots;
}

.marks {
  grid-area: marks;
  display: flex;
  gap: var(--space-2);
}

.more {
  grid-area: more;
}

.how {
  grid-area: how;
  margin: 0;
  padding-inline-start: var(--space-3);
  overflow: hidden;
  color: var(--muted);
  font-size: var(--text-s);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.how.in-place {
  grid-area: said;
  min-width: 0;
  /* (Beside the passes and "⋯", in two lines if it must, rather than cut short: it is read whole once.) */
  white-space: normal;
  text-wrap: balance;
}

/*
 * A phone: what the step is (or what to do), its passes and "⋯" on top; under them the two words,
 * each half the width, to be pressed after a pass without aiming.
 */
@media (max-width: 599px) {
  .step-bar.playing {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'said dots more'
      'marks marks marks';
  }

  .marks {
    margin-inline-start: var(--space-3);
  }

  .mark {
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
