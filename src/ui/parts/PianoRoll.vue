<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { PedalMove, RollView } from '../../application/ports/RollView';
import type { Fingering } from '../../domain/fingering/own';
import type { Hand } from '../../domain/note';
import { useAnimationFrame } from '../browser/useAnimationFrame';
import { useDrawnView } from '../browser/useDrawnView';
import { useDeps } from '../deps';
import { useGlide } from '../motion/useGlide';
import { useI18n } from '../i18n/useI18n';
import { readRollColors } from '../theme/readCanvasColors';
import { useCanvasColors } from '../theme/useCanvasColors';

/**
 * `fingers`: the finger for each of the piece's notes, printed on its tile; `picked`: the notes
 * ringed (see RollFrame). While `fingering`, a press on a tile picks its note instead of going there.
 */
const props = defineProps<{ fingers?: readonly (Fingering | null)[]; fingering?: boolean; picked?: readonly number[] }>();
const emit = defineEmits<{ pick: [note: number] }>();
const { playback, barLoop: loop, createRoll } = useDeps();
const { noteLabel, t } = useI18n();
/** The right pedal is just "Pedal": it is the one people mean. */
const PEDAL_LABELS = {
  sustain: { press: 'pedalPress', release: 'pedalRelease', change: 'pedalChange' },
  soft: { press: 'softPedalPress', release: 'softPedalRelease', change: 'softPedalChange' },
  sostenuto: { press: 'sostenutoPedalPress', release: 'sostenutoPedalRelease', change: 'sostenutoPedalChange' },
} as const;
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

const colors = useCanvasColors(readRollColors, () => roll.view);
/*
 * Resizing a canvas wipes it, and the browser tells of a new size after the frame's drawing is
 * done: drawn again at once, or the frame goes out blank (a blink at every step while the stage
 * grows or shrinks).
 */
const roll = useDrawnView(
  canvas,
  (element): RollView => createRoll(element, colors()),
  () => draw(),
);

// Drawn outside Vue's reactivity: 60 fps straight from Playback to the canvas.
useAnimationFrame(draw);

const isHandEnabled = (hand: Hand) => playback.isHandEnabled(hand);
const pedalLabel = (move: PedalMove) => t(PEDAL_LABELS[move.pedal][move.kind]);

function draw(): void {
  const view = roll.view;
  if (!view) return;
  view.render({
    score: playback.score ?? EMPTY_SCORE,
    position: playback.position,
    playing: playback.playing,
    loop: playback.loop,
    isHandEnabled,
    pedalEnabled: playback.pedalEnabled,
    noteLabel,
    pedalLabel,
    fingers: props.fingers,
    picked: props.picked,
  });
  canvas.value?.classList.toggle('scrollable', view.scrollable);
}

// --- A tap jumps to that moment (or, while fingering, picks the note tapped); a drag looks around: up and down through the music, sideways
// along a keyboard wider than the screen. The music plays on, and the view goes back to it later. ---

/** A pointer moves this many pixels before it counts as dragging rather than tapping. */
const DRAG_PX = 6;

/**
 * Let go on the move, the view goes on the way it was drawn and slows to rest (see
 * ui/motion/glide.ts): through the music, or along the keyboard. In pixels of the pointer's way.
 */
const glides = {
  time: useGlide((by) => {
    const view = roll.view;
    const secondsPerPixel = view?.secondsPerPixel;
    return view && secondsPerPixel ? view.browseBy(by * secondsPerPixel) / secondsPerPixel : 0;
  }),
  // (The keyboard is scrolled against the pointer: drawn to the left, it shows what is to the right.)
  keys: useGlide((by) => -(roll.view?.scrollBy(-by) ?? 0)),
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
    roll.view?.scrollBy(press.x - x);
    glides.keys.follow(x);
  }
  if (press.drag === 'time') {
    // Pulling the notes down brings later music into view.
    const secondsPerPixel = roll.view?.secondsPerPixel;
    if (secondsPerPixel) roll.view?.browseBy((y - press.y) * secondsPerPixel);
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
  const note = props.fingering ? roll.view?.noteAt(event.clientX, event.clientY) : null;
  if (note !== null && note !== undefined) {
    emit('pick', note);
    return;
  }
  const time = roll.view?.timeAt(event.clientY);
  if (time === null || time === undefined) return;
  loop.jumpTo(time);
  roll.view?.followMusic();
}

function onPointerCancel(event: PointerEvent): void {
  if (press?.pointerId === event.pointerId) press = null;
}

/** Trackpads scroll sideways directly; with a mouse wheel, hold Shift. */
function onWheel(event: WheelEvent): void {
  const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
  const view = roll.view;
  if (!dx || !view?.scrollable) return;
  event.preventDefault();
  view.scrollBy(dx);
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
