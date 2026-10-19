<script setup lang="ts">
import { useGlide } from '../motion/useGlide';
import { computed, ref, useTemplateRef, watch } from 'vue';
import type { NoteOnPage } from '../../domain/fingering/own';
import { timeAtPage, writtenBarNumber, type Score } from '../../domain/score';
import type { StaffView } from '../../application/ports/StaffView';
import { useAnimationFrame } from '../browser/useAnimationFrame';
import { useDrawnView } from '../browser/useDrawnView';
import { usePlaybackState } from '../app/usePlaybackState';
import type { Hand } from '../../domain/note';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

const { playback, barLoop: loop, createStaff } = useDeps();
const state = usePlaybackState(playback);
const { t, locale } = useI18n();
/**
 * `page`: what the staff is given to draw, the piece with its fingering as it is to be shown (see
 * useFingeredPage). `fingering`: a press on a note picks it (`pick`), and does not move the music;
 * `picked` is marked.
 */
const props = defineProps<{ page: Score | null; fingering?: boolean; picked?: NoteOnPage | null }>();
const emit = defineEmits<{ pick: [note: NoteOnPage] }>();
const page = computed(() => props.page);
watch(
  () => props.picked,
  (note) => staff.view?.setPicked(note ?? null),
);
const handLabels = () => ({ right: t('handMarkRight'), left: t('handMarkLeft') });
const container = useTemplateRef<HTMLDivElement>('container');

const staff = useDrawnView(container, (element): StaffView => {
  const made = createStaff(element);
  made.setHandLabels(handLabels());
  made.setScore(page.value);
  made.setLoop(state.value.loop);
  return made;
});

// The tape is rebuilt only when the score or the loop changes…
watch(page, (score) => staff.view?.setScore(score));
watch(
  () => state.value.loop,
  (loop) => staff.view?.setLoop(loop),
);

watch(locale, () => staff.view?.setHandLabels(handLabels()));

// …and only slides during playback, outside Vue's reactivity.
const handOn = (hand: Hand) => playback.isHandEnabled(hand);
useAnimationFrame(() => staff.view?.render(playback.position, handOn, playback.playing));

// --- Click to jump there; drag to look through the tape; Shift+drag (or a long press) to loop bars ---

/** Let go on the move, the tape goes on and slows to rest (see ui/motion/glide.ts). */
const glide = useGlide((by) => staff.view?.dragBy(by) ?? 0);

/** A pointer moves this many pixels before it counts as dragging rather than clicking. */
const DRAG_PX = 6;
/** On a touch screen, holding this long before moving selects bars to loop instead of dragging the tape. */
const LONG_PRESS_MS = 450;
const grabbing = ref(false);

/** The press in progress: where it started on the page, what it does, and the bar it has reached. */
let press: {
  pointerId: number;
  startX: number;
  x: number;
  place: { bar: number; beat: number };
  toBar: number;
  mode: 'pending' | 'drag' | 'select';
  /** The press caught the tape gliding: it stops it, and is not a click on what happened to be under it. */
  caught: boolean;
  /** Shift was held, or the long press fired: moving selects bars. */
  selecting: boolean;
  timer: number;
} | null = null;

function endPress(): void {
  if (press) clearTimeout(press.timer);
  press = null;
  grabbing.value = false;
  staff.view?.setSelection(null);
}

function onPointerDown(event: PointerEvent): void {
  if (press || event.button !== 0) return;
  const place = staff.view?.pageAt(event.clientX);
  if (!place) return;
  const current = {
    pointerId: event.pointerId,
    startX: event.clientX,
    x: event.clientX,
    place,
    toBar: place.bar,
    mode: 'pending' as const,
    caught: glide.moving,
    selecting: event.shiftKey,
    timer: 0,
  };
  if (event.pointerType === 'touch') {
    current.timer = window.setTimeout(() => {
      if (press !== current || press.mode !== 'pending') return;
      press.mode = 'select';
      press.selecting = true;
      staff.view?.setSelection({ from: place.bar, to: place.bar });
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  }
  press = current;
  glide.hold(event.clientX);
  container.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!press) {
    if (event.pointerType === 'mouse') staff.view?.setHover(staff.view.pageAt(event.clientX)?.bar ?? null);
    return;
  }
  if (event.pointerId !== press.pointerId) return;
  if (press.mode === 'pending' && Math.abs(event.clientX - press.startX) > DRAG_PX) {
    clearTimeout(press.timer);
    press.mode = press.selecting ? 'select' : 'drag';
    grabbing.value = press.mode === 'drag';
    staff.view?.setHover(null);
  }
  if (press.mode === 'drag') {
    staff.view?.dragBy(event.clientX - press.x);
    glide.follow(event.clientX);
  } else if (press.mode === 'select') {
    press.toBar = staff.view?.pageAt(event.clientX)?.bar ?? press.toBar;
    staff.view?.setSelection({ from: press.place.bar, to: press.toBar });
  }
  press.x = event.clientX;
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const { place, toBar, mode, caught } = press;
  endPress();
  if (mode === 'drag') glide.letGo();
  const score = playback.score;
  if (!score || mode === 'drag' || (caught && mode === 'pending')) return;
  if (props.fingering && mode === 'pending') {
    // Fingering: a press on a note picks it; the music stays where it is.
    const note = staff.view?.noteAt(event.clientX, event.clientY);
    if (note) emit('pick', note);
    return;
  }
  // Repeated bars: the pass nearest to where playback is now.
  const time = timeAtPage(score, place.bar, place.beat, playback.position);
  if (mode === 'select') {
    loop.select(writtenBarNumber(score, place.bar), writtenBarNumber(score, toBar), time);
  } else {
    loop.jumpTo(time);
    staff.view?.followMusic();
  }
}

function onPointerLeave(): void {
  staff.view?.setHover(null);
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
