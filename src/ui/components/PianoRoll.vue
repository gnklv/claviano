<script setup lang="ts">
import { useGlide } from '../composables/useGlide';
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { RollView } from '../../application/ports/RollView';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readRollColors } from '../theme/readRollColors';
import { useTheme } from '../theme/useTheme';

const { playback, barLoop: loop, createRoll } = useDeps();
const { noteLabel, t } = useI18n();
/** The right pedal is just "Pedal": it is the one people mean. */
const PEDAL_LABELS = {
  sustain: { press: 'pedalPress', release: 'pedalRelease', change: 'pedalChange' },
  soft: { press: 'softPedalPress', release: 'softPedalRelease', change: 'softPedalChange' },
  sostenuto: { press: 'sostenutoPedalPress', release: 'sostenutoPedalRelease', change: 'sostenutoPedalChange' },
} as const;
const { theme } = useTheme();
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

let roll: RollView | null = null;
/*
 * Resizing a canvas wipes it, and the browser tells of a new size after the frame's drawing is
 * done: drawn again at once, or the frame goes out blank (a blink at every step while the stage
 * grows or shrinks).
 */
const resizeObserver = new ResizeObserver(() => {
  roll?.resize();
  draw();
});

onMounted(() => {
  roll = createRoll(canvas.value!);
  roll.setColors(readRollColors());
  resizeObserver.observe(canvas.value!);
});

// Canvas can't follow CSS variables by itself; re-read them once the new theme is applied.
watch(theme, () => roll?.setColors(readRollColors()), { flush: 'post' });
onUnmounted(() => resizeObserver.disconnect());

// Drawn outside Vue's reactivity: 60 fps straight from Playback to the canvas.
useAnimationFrame(draw);

function draw(): void {
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
}

// --- A tap jumps to that moment; a drag looks around: up and down through the music, sideways
// along a keyboard wider than the screen. The music plays on, and the view goes back to it later. ---

/** A pointer moves this many pixels before it counts as dragging rather than tapping. */
const DRAG_PX = 6;

/**
 * Let go on the move, the view goes on the way it was drawn and slows to rest (see
 * ui/motion/glide.ts): through the music, or along the keyboard. In pixels of the pointer's way.
 */
const glides = {
  time: useGlide((by) => {
    const secondsPerPixel = roll?.secondsPerPixel;
    return roll && secondsPerPixel ? roll.browseBy(by * secondsPerPixel) / secondsPerPixel : 0;
  }),
  // (The keyboard is scrolled against the pointer: drawn to the left, it shows what is to the right.)
  keys: useGlide((by) => -(roll?.scrollBy(-by) ?? 0)),
};

/**
 * The finger or mouse currently pressed, where it was last, and which way it drags once it does.
 * `caught`: it came down on a view that was gliding, and stops it: not a tap on what was under it.
 */
let press: { pointerId: number; x: number; y: number; startX: number; startY: number; drag: 'none' | 'time' | 'keys'; caught: boolean } | null = null;

function onPointerDown(event: PointerEvent): void {
  if (press || event.button !== 0) return;
  const { clientX: x, clientY: y } = event;
  press = { pointerId: event.pointerId, x, y, startX: x, startY: y, drag: 'none', caught: glides.time.moving || glides.keys.moving };
  glides.time.hold(y);
  glides.keys.hold(x);
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
  if (press.drag === 'keys') {
    roll?.scrollBy(press.x - x);
    glides.keys.follow(x);
  }
  if (press.drag === 'time') {
    // Pulling the notes down brings later music into view.
    const secondsPerPixel = roll?.secondsPerPixel;
    if (secondsPerPixel) roll?.browseBy((y - press.y) * secondsPerPixel);
    glides.time.follow(y);
  }
  press.x = x;
  press.y = y;
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const { drag, caught } = press;
  press = null;
  if (drag !== 'none') {
    glides[drag].letGo();
    return;
  }
  if (caught) return;
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
  <!-- A box that takes the room given; the canvas fills it (see .roll below). -->
  <div class="roll-box">
    <canvas
      ref="canvas"
      class="roll"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @wheel="onWheel"
    />
  </div>
</template>

<style scoped>
/*
 * The canvas is laid over its box, not in it: its size is the room the box is given, never what
 * was last drawn into it. (In Safari a canvas in the flow keeps the height it had with the whole
 * stage to itself, and the roll does not shrink when the staff comes to share the stage.)
 */
.roll-box {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.roll {
  position: absolute;
  inset: 0;
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
