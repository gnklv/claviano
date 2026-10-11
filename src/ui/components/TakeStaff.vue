<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import type { StaffView } from '../../application/ports/StaffView';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useRecorder } from '../composables/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * The take as notes: written down as it is played, the staff moving on under the place the music
 * has reached. Once recorded it stands at its end, and can be drawn back by hand to read.
 */
const { recorder, createStaff } = useDeps();
const { t, locale } = useI18n();
const state = useRecorder(recorder);
const container = useTemplateRef<HTMLElement>('container');

let staff: StaffView | null = null;
const resizeObserver = new ResizeObserver(() => staff?.resize());

/** The take is written down anew whenever a note is added to it or ends. */
function write(): void {
  staff?.setScore(recorder.score(t('freePlay')));
  staff?.followMusic();
}

onMounted(() => {
  staff = createStaff(container.value!);
  // (What is written is behind the cursor: it stands near the right, with a bar's room for the last note.)
  staff.setCursorPlace(0.8);
  staff.setHandLabels({ right: t('handMarkRight'), left: t('handMarkLeft') });
  resizeObserver.observe(container.value!);
  write();
});
onUnmounted(() => resizeObserver.disconnect());
watch(() => [state.value.state, state.value.notes, state.value.ends], write);
watch(locale, () => staff?.setHandLabels({ right: t('handMarkRight'), left: t('handMarkLeft') }));

useAnimationFrame(() => staff?.render(recorder.take?.seconds ?? 0, undefined, state.value.state === 'recording'));

// --- Drawn along by hand, to read what was written. ---

let dragged: { pointer: number; x: number } | null = null;

function onPointerDown(event: PointerEvent): void {
  dragged = { pointer: event.pointerId, x: event.clientX };
  container.value?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (dragged?.pointer !== event.pointerId) return;
  staff?.dragBy(event.clientX - dragged.x);
  dragged.x = event.clientX;
}

function onPointerUp(event: PointerEvent): void {
  if (dragged?.pointer === event.pointerId) dragged = null;
}
</script>

<template>
  <div ref="container" class="take-staff" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" />
</template>

<style scoped>
.take-staff {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  /* Sideways drags are ours; pinch zoom stays the browser's. */
  touch-action: pan-y pinch-zoom;
}
</style>
