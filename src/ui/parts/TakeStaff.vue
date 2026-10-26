<script setup lang="ts">
import { useGlide } from '../motion/useGlide';
import { onMounted, useTemplateRef, watch } from 'vue';
import type { StaffView } from '../../application/ports/StaffView';
import { useAnimationFrame } from '../browser/useAnimationFrame';
import { useDrawnView } from '../browser/useDrawnView';
import { useRecorder } from '../app/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readStaffColors } from '../theme/readCanvasColors';
import { useCanvasColors } from '../theme/useCanvasColors';

/*
 * The take as notes: written down as it is played, the staff moving on under the place the music
 * has reached. Once recorded it stands at its end, and can be drawn back by hand to read. Before a
 * take, the staff it will be written on, empty, in the metre set.
 */
const { recorder, createStaff } = useDeps();
const { t, locale } = useI18n();
const state = useRecorder(recorder);
const container = useTemplateRef<HTMLElement>('container');

const colors = useCanvasColors(readStaffColors, () => staff.view);
const staff = useDrawnView(container, (element): StaffView => {
  const made = createStaff(element, colors());
  // (What is written is behind the cursor: it stands near the right, with a bar's room for the last note.)
  made.setCursorPlace(0.8);
  made.setHandLabels({ right: t('handMarkRight'), left: t('handMarkLeft') });
  return made;
});

/** The take is written down anew whenever a note is added to it or ends. */
function write(): void {
  staff.view?.setScore(recorder.sheet(t('freePlay')));
  staff.view?.followMusic();
}

onMounted(write);
watch(() => [state.value.state, state.value.notes, state.value.ends, state.value.listening, state.value.meter, state.value.tempo], write);
watch(locale, () => staff.view?.setHandLabels({ right: t('handMarkRight'), left: t('handMarkLeft') }));

useAnimationFrame(() => staff.view?.render(recorder.position, undefined, state.value.state === 'recording' || state.value.listening));

// --- Drawn along by hand, to read what was written. ---

let dragged: { pointer: number; x: number } | null = null;
/** Let go on the move, the staff goes on and slows to rest (see ui/motion/glide.ts). */
const glide = useGlide((by) => staff.view?.dragBy(by) ?? 0);

function onPointerDown(event: PointerEvent): void {
  dragged = { pointer: event.pointerId, x: event.clientX };
  glide.hold(event.clientX);
  container.value?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (dragged?.pointer !== event.pointerId) return;
  staff.view?.dragBy(event.clientX - dragged.x);
  glide.follow(event.clientX);
  dragged.x = event.clientX;
}

function onPointerUp(event: PointerEvent): void {
  if (dragged?.pointer !== event.pointerId) return;
  dragged = null;
  glide.letGo();
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
