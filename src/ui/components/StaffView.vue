<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { timeAtPage, writtenBarNumber } from '../../domain/score';
import type { SvgStaff } from '../../infrastructure/render/SvgStaff';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useBarLoop } from '../composables/useBarLoop';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

const { playback, createStaff } = useDeps();
const state = usePlaybackState(playback);
const { t, locale } = useI18n();
const handLabels = () => ({ right: t('handMarkRight'), left: t('handMarkLeft') });
const container = useTemplateRef<HTMLDivElement>('container');

let staff: SvgStaff | null = null;
const resizeObserver = new ResizeObserver(() => staff?.resize());

onMounted(() => {
  staff = createStaff(container.value!);
  staff.setHandLabels(handLabels());
  staff.setScore(state.value.score);
  staff.setLoop(state.value.loop);
  resizeObserver.observe(container.value!);
});
onUnmounted(() => resizeObserver.disconnect());

// The tape is rebuilt only when the score or the loop changes…
watch(
  () => state.value.score,
  (score) => staff?.setScore(score),
);
watch(
  () => state.value.loop,
  (loop) => staff?.setLoop(loop),
);

watch(locale, () => staff?.setHandLabels(handLabels()));

// …and only slides during playback, outside Vue's reactivity.
useAnimationFrame(() => staff?.render(playback.position, (hand) => playback.isHandEnabled(hand), playback.playing));

// --- Click to jump there; drag to look through the tape; Shift+drag (or a long press) to loop bars ---

/** A pointer moves this many pixels before it counts as dragging rather than clicking. */
const DRAG_PX = 6;
/** On a touch screen, holding this long before moving selects bars to loop instead of dragging the tape. */
const LONG_PRESS_MS = 450;
const loop = useBarLoop(playback);
const grabbing = ref(false);

/** The press in progress: where it started on the page, what it does, and the bar it has reached. */
let press: {
  pointerId: number;
  startX: number;
  x: number;
  place: { bar: number; beat: number };
  toBar: number;
  mode: 'pending' | 'drag' | 'select';
  /** Shift was held, or the long press fired: moving selects bars. */
  selecting: boolean;
  timer: number;
} | null = null;

function endPress(): void {
  if (press) clearTimeout(press.timer);
  press = null;
  grabbing.value = false;
  staff?.setSelection(null);
}

function onPointerDown(event: PointerEvent): void {
  if (press || event.button !== 0) return;
  const place = staff?.pageAt(event.clientX);
  if (!place) return;
  const current = {
    pointerId: event.pointerId,
    startX: event.clientX,
    x: event.clientX,
    place,
    toBar: place.bar,
    mode: 'pending' as const,
    selecting: event.shiftKey,
    timer: 0,
  };
  if (event.pointerType === 'touch') {
    current.timer = window.setTimeout(() => {
      if (press !== current || press.mode !== 'pending') return;
      press.mode = 'select';
      press.selecting = true;
      staff?.setSelection({ from: place.bar, to: place.bar });
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  }
  press = current;
  container.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!press) {
    if (event.pointerType === 'mouse') staff?.setHover(staff.pageAt(event.clientX)?.bar ?? null);
    return;
  }
  if (event.pointerId !== press.pointerId) return;
  if (press.mode === 'pending' && Math.abs(event.clientX - press.startX) > DRAG_PX) {
    clearTimeout(press.timer);
    press.mode = press.selecting ? 'select' : 'drag';
    grabbing.value = press.mode === 'drag';
    staff?.setHover(null);
  }
  if (press.mode === 'drag') {
    staff?.dragBy(event.clientX - press.x);
  } else if (press.mode === 'select') {
    press.toBar = staff?.pageAt(event.clientX)?.bar ?? press.toBar;
    staff?.setSelection({ from: press.place.bar, to: press.toBar });
  }
  press.x = event.clientX;
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const { place, toBar, mode } = press;
  endPress();
  const score = playback.score;
  if (!score || mode === 'drag') return;
  // Repeated bars: the pass nearest to where playback is now.
  const time = timeAtPage(score, place.bar, place.beat, playback.position);
  if (mode === 'select') {
    loop.select(writtenBarNumber(score, place.bar), writtenBarNumber(score, toBar), time);
  } else {
    loop.jumpTo(time);
    staff?.followMusic();
  }
}

function onPointerLeave(): void {
  staff?.setHover(null);
}

function onPointerCancel(event: PointerEvent): void {
  if (press?.pointerId === event.pointerId) endPress();
}
</script>

<template>
  <div
    ref="container"
    class="staff"
    :class="{ interactive: state.score, grabbing }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerLeave"
  />
</template>

<style scoped>
.staff {
  width: 100%;
  height: 100%;
}

.interactive {
  cursor: pointer;
  /* Sideways drags are ours (the tape, or bars to loop); vertical scrolling and pinch zoom stay the browser's. */
  touch-action: pan-y pinch-zoom;
  user-select: none;
}

.grabbing {
  cursor: grabbing;
}
</style>
