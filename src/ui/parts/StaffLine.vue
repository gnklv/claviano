<script setup lang="ts">
import { useTemplateRef, watch } from 'vue';
import type { NoteOnPage } from '../../domain/fingering/own';
import type { Score } from '../../domain/score';
import type { StaffView } from '../../application/ports/StaffView';
import { useAnimationFrame } from '../browser/useAnimationFrame';
import { useDrawnView } from '../browser/useDrawnView';
import { litHands } from '../app/litHands';
import { usePlaybackState } from '../app/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readStaffColors } from '../theme/readCanvasColors';
import { useCanvasColors } from '../theme/useCanvasColors';

/*
 * One line of the staff (see StaffView): the piece, under the music as it plays, `over` lines of
 * the page standing over it and `under` under it. What is pressed on it is its owner's to tell.
 */
const props = defineProps<{ page: Score | null; picked: NoteOnPage | null; over: number; under: number }>();
const { playback, plan, createStaff } = useDeps();
const state = usePlaybackState(playback);
const { t, locale } = useI18n();
const handLabels = () => ({ right: t('handMarkRight'), left: t('handMarkLeft') });
const container = useTemplateRef<HTMLDivElement>('container');

const colors = useCanvasColors(readStaffColors, () => staff.view);
const staff = useDrawnView(container, (element): StaffView => {
  const made = createStaff(element, colors());
  made.setLine(props.over, props.under);
  made.setHandLabels(handLabels());
  made.setScore(props.page);
  made.setLoop(state.value.loop);
  if (props.picked) made.setPicked(props.picked);
  return made;
});

// The tape is rebuilt only when the score or the loop changes…
watch(
  () => props.page,
  (score) => staff.view?.setScore(score),
);
watch(
  () => state.value.loop,
  (loop) => staff.view?.setLoop(loop),
);
watch(
  () => props.picked,
  (note) => staff.view?.setPicked(note),
);
watch(
  () => [props.over, props.under] as const,
  ([over, under]) => staff.view?.setLine(over, under),
);
watch(locale, () => staff.view?.setHandLabels(handLabels()));

// …and only slides during playback, outside Vue's reactivity.
/** (Lit: the hands one reads now, see litHands.) */
const handOn = litHands(plan, playback);
useAnimationFrame(() => staff.view?.render(playback.position, handOn, playback.playing));

defineExpose({
  /** The line's view, once it is made. */
  view: (): StaffView | null => staff.view,
  /** Whether a pointer at `clientY` is over this line. */
  holds: (clientY: number): boolean => {
    const box = container.value?.getBoundingClientRect();
    return !!box && clientY >= box.top && clientY < box.bottom;
  },
});
</script>

<template>
  <div ref="container" class="staff-line" />
</template>

<style scoped>
.staff-line {
  min-height: 0;
}
</style>
