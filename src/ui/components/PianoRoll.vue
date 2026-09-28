<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { CanvasPianoRoll } from '../../infrastructure/render/CanvasPianoRoll';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useBarLoop } from '../composables/useBarLoop';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readRollColors } from '../theme/readRollColors';
import { useTheme } from '../theme/useTheme';

const { playback, createRoll } = useDeps();
const { noteLabel, t } = useI18n();
/** The right pedal is just "Pedal": it is the one people mean. */
const PEDAL_LABELS = {
  sustain: { press: 'pedalPress', release: 'pedalRelease', change: 'pedalChange' },
  soft: { press: 'softPedalPress', release: 'softPedalRelease', change: 'softPedalChange' },
  sostenuto: { press: 'sostenutoPedalPress', release: 'sostenutoPedalRelease', change: 'sostenutoPedalChange' },
} as const;
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
    pedalEnabled: playback.pedalEnabled,
    noteLabel,
    pedalLabel: (move) => t(PEDAL_LABELS[move.pedal][move.kind]),
  });
  canvas.value?.classList.toggle('scrollable', roll.scrollable);
});

// --- A tap jumps to that moment; a drag looks around: up and down through the music, sideways
// along a keyboard wider than the screen. The music plays on, and the view goes back to it later. ---

/** A pointer moves this many pixels before it counts as dragging rather than tapping. */
const DRAG_PX = 6;
const loop = useBarLoop(playback);

/** The finger or mouse currently pressed, where it was last, and which way it drags once it does. */
let press: { pointerId: number; x: number; y: number; startX: number; startY: number; drag: 'none' | 'time' | 'keys' } | null = null;

function onPointerDown(event: PointerEvent): void {
  if (press || event.button !== 0) return;
  const { clientX: x, clientY: y } = event;
  press = { pointerId: event.pointerId, x, y, startX: x, startY: y, drag: 'none' };
  canvas.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const { clientX: x, clientY: y } = event;
  if (press.drag === 'none') {
    const dx = Math.abs(x - press.startX);
    const dy = Math.abs(y - press.startY);
    // The first clear movement decides the direction for the whole drag.
    if (Math.max(dx, dy) > DRAG_PX) press.drag = dy >= dx ? 'time' : 'keys';
  }
  if (press.drag === 'keys') roll?.scrollBy(press.x - x);
  if (press.drag === 'time') {
    // Pulling the notes down brings later music into view.
    const secondsPerPixel = roll?.secondsPerPixel;
    if (secondsPerPixel) roll?.browseBy((y - press.y) * secondsPerPixel);
  }
  press.x = x;
  press.y = y;
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const tapped = press.drag === 'none';
  press = null;
  if (!tapped) return;
  const time = roll?.timeAt(event.clientY);
  if (time === null || time === undefined) return;
  loop.jumpTo(time);
  roll?.followMusic();
}

function onPointerCancel(event: PointerEvent): void {
  if (press?.pointerId === event.pointerId) press = null;
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
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @wheel="onWheel"
  />
</template>

<style scoped>
.roll {
  display: block;
  width: 100%;
  height: 100%;
  /* Drags are ours (through the music, along the keyboard); pinch zoom stays the browser's. */
  touch-action: pinch-zoom;
  /* A tap jumps to that moment of the music. */
  cursor: pointer;
}

.roll.scrollable {
  cursor: grab;
}

.roll.scrollable:active {
  cursor: grabbing;
}
</style>
