<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { CanvasPianoRoll } from '../../infrastructure/render/CanvasPianoRoll';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readRollColors } from '../theme/readRollColors';
import { useTheme } from '../theme/useTheme';

const { playback, createRoll } = useDeps();
const { noteLabel } = useI18n();
const { theme } = useTheme();
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

let roll: CanvasPianoRoll | null = null;
const resizeObserver = new ResizeObserver(() => roll?.resize());

onMounted(() => {
  roll = createRoll(canvas.value!);
  roll.setColors(readRollColors());
  resizeObserver.observe(canvas.value!);
});

// Canvas can't follow CSS variables by itself; re-read them once the new theme is applied.
watch(theme, () => roll?.setColors(readRollColors()), { flush: 'post' });
onUnmounted(() => resizeObserver.disconnect());

// Drawn outside Vue's reactivity: 60 fps straight from Playback to the canvas.
useAnimationFrame(() => {
  if (!roll) return;
  roll.render({
    score: playback.score ?? EMPTY_SCORE,
    position: playback.position,
    playing: playback.playing,
    loop: playback.loop,
    isHandEnabled: (hand) => playback.isHandEnabled(hand),
    noteLabel,
  });
  canvas.value?.classList.toggle('scrollable', roll.scrollable);
});

// --- Manual scrolling of a keyboard wider than the screen ---

/** The finger or mouse currently dragging the keyboard, and where it was last. */
let drag: { pointerId: number; x: number } | null = null;

function onPointerDown(event: PointerEvent): void {
  if (!roll?.scrollable || drag) return;
  drag = { pointerId: event.pointerId, x: event.clientX };
  canvas.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  roll?.scrollBy(drag.x - event.clientX);
  drag.x = event.clientX;
}

function onPointerEnd(event: PointerEvent): void {
  if (drag?.pointerId === event.pointerId) drag = null;
}

/** Trackpads scroll sideways directly; with a mouse wheel, hold Shift. */
function onWheel(event: WheelEvent): void {
  const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
  if (!dx || !roll?.scrollable) return;
  event.preventDefault();
  roll.scrollBy(dx);
}
</script>

<template>
  <canvas
    ref="canvas"
    class="roll"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @wheel="onWheel"
  />
</template>

<style scoped>
.roll {
  display: block;
  width: 100%;
  height: 100%;
  /* Sideways swipes are ours (keyboard scrolling); vertical scroll and pinch zoom stay the browser's. */
  touch-action: pan-y pinch-zoom;
}

.roll.scrollable {
  cursor: grab;
}

.roll.scrollable:active {
  cursor: grabbing;
}
</style>
