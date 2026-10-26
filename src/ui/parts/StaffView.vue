<script setup lang="ts">
import { useGlide } from '../motion/useGlide';
import { ref, useTemplateRef, watch } from 'vue';
import type { NoteOnPage } from '../../domain/fingering/own';
import { timeAtPage, writtenBarNumber, type Score } from '../../domain/score';
import type { StaffView } from '../../application/ports/StaffView';
import { useResize } from '../browser/useResize';
import { usePlaybackState } from '../app/usePlaybackState';
import { useDeps } from '../deps';
import StaffLine from './StaffLine.vue';

const { playback, barLoop: loop } = useDeps();
const state = usePlaybackState(playback);
/**
 * `page`: what the staff is given to draw, the piece with its fingering as it is to be shown (see
 * useFingeredPage). `fingering`: a press on a note picks it (`pick`), and does not move the music;
 * `picked` is marked. `loops`: bars may be selected to loop (Shift and a drag, a long press); not
 * while the piece is listened to. `lined`: the staff may stand in lines one under another, as on a
 * page, as many as fit (a stage tall and narrow, a phone held upright, has room for more than one).
 */
const props = defineProps<{ page: Score | null; fingering?: boolean; picked?: NoteOnPage | null; loops?: boolean; lined?: boolean }>();
const emit = defineEmits<{ pick: [note: NoteOnPage] }>();
const container = useTemplateRef<HTMLDivElement>('container');

// --- Lines: as many as fit whole, each at the size its width allows; it goes on where the one over it ends. ---

/**
 * Lines at the most: the music is read in the first, and the eye goes down to what comes next; a
 * fourth, on a screen that had room for it, would be read no further (and is drawn every frame).
 */
const MOST_LINES = 3;
/**
 * A line may be this much lower than its width would have it, its staff drawn as much smaller: too
 * little to be seen, and a phone falls short of a line by little (a stage of 375 × 636 px has room
 * for 2.996 lines of the Ode).
 */
const LINE_SLACK = 0.03;
const count = ref(1);
/** A line, as its owner holds it (see StaffLine). */
interface Line {
  readonly $props: { readonly over: number };
  view(): StaffView | null;
  holds(clientY: number): boolean;
}
const lineParts = useTemplateRef<Line[]>('lines');
/** The lines' views, the first (where the music is) first. */
const views = (): StaffView[] =>
  [...(lineParts.value ?? [])]
    .sort((a, b) => a.$props.over - b.$props.over)
    .map((line) => line.view())
    .filter((view) => view !== null);
/** The view of the line at `clientY` (the first, where none is). */
const viewAt = (clientY: number): StaffView | null => (lineParts.value ?? []).find((line) => line.holds(clientY))?.view() ?? views()[0] ?? null;

/** As many lines as fit whole in the height, at the size the width gives the staff. */
function fit(): void {
  const box = container.value;
  const first = views()[0];
  const need = first && box ? first.heightAt(box.clientWidth) : 0;
  count.value = props.lined && box && need > 0 ? Math.min(MOST_LINES, Math.max(1, Math.floor(box.clientHeight / (need * (1 - LINE_SLACK))))) : 1;
}
useResize(container, fit);
// (After the lines are given the piece: how much room it needs over and under its staves is its own.)
watch([() => props.lined, () => props.page], fit, { flush: 'post' });

// --- Click to jump there; drag to look through the tape; Shift+drag (or a long press) to loop bars ---

/** Let go on the move, the tape goes on and slows to rest (see ui/motion/glide.ts). */
const glide = useGlide((by) => dragBy(by));

/** Every line moved together; by as much as the first could be. */
function dragBy(dx: number): number {
  const [first, ...rest] = views();
  const moved = first?.dragBy(dx) ?? 0;
  for (const view of rest) view.dragBy(dx);
  return moved;
}

/** A pointer moves this many pixels before it counts as dragging rather than clicking. */
const DRAG_PX = 6;
/** On a touch screen, holding this long before moving selects bars to loop instead of dragging the tape. */
const LONG_PRESS_MS = 450;
const grabbing = ref(false);

/** The press in progress: where it started on the page, what it does, and the bar it has reached. */
let press: {
  pointerId: number;
  /** The line pressed: a place in it is in its bars. */
  line: StaffView;
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
  for (const view of views()) view.setSelection(null);
}

function onPointerDown(event: PointerEvent): void {
  if (press || event.button !== 0) return;
  const line = viewAt(event.clientY);
  const place = line?.pageAt(event.clientX);
  if (!line || !place) return;
  const current = {
    pointerId: event.pointerId,
    line,
    startX: event.clientX,
    x: event.clientX,
    place,
    toBar: place.bar,
    mode: 'pending' as const,
    caught: glide.moving,
    selecting: props.loops !== false && event.shiftKey,
    timer: 0,
  };
  if (event.pointerType === 'touch' && props.loops !== false) {
    current.timer = window.setTimeout(() => {
      if (press !== current || press.mode !== 'pending') return;
      press.mode = 'select';
      press.selecting = true;
      for (const view of views()) view.setSelection({ from: place.bar, to: place.bar });
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  }
  press = current;
  glide.hold(event.clientX);
  container.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!press) {
    if (event.pointerType === 'mouse') hover(viewAt(event.clientY)?.pageAt(event.clientX)?.bar ?? null);
    return;
  }
  if (event.pointerId !== press.pointerId) return;
  if (press.mode === 'pending' && Math.abs(event.clientX - press.startX) > DRAG_PX) {
    clearTimeout(press.timer);
    press.mode = press.selecting ? 'select' : 'drag';
    grabbing.value = press.mode === 'drag';
    hover(null);
  }
  if (press.mode === 'drag') {
    dragBy(event.clientX - press.x);
    glide.follow(event.clientX);
  } else if (press.mode === 'select') {
    // (Over another line, its bars: a loop may be drawn from one line on to the next.)
    press.toBar = viewAt(event.clientY)?.pageAt(event.clientX)?.bar ?? press.toBar;
    const selection = { from: press.place.bar, to: press.toBar };
    for (const view of views()) view.setSelection(selection);
  }
  press.x = event.clientX;
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  const { line, place, toBar, mode, caught } = press;
  endPress();
  if (mode === 'drag') glide.letGo();
  const score = playback.score;
  if (!score || mode === 'drag' || (caught && mode === 'pending')) return;
  if (props.fingering && mode === 'pending') {
    // Fingering: a press on a note picks it; the music stays where it is.
    const note = line.noteAt(event.clientX, event.clientY);
    if (note) emit('pick', note);
    return;
  }
  // Repeated bars: the pass nearest to where playback is now.
  const time = timeAtPage(score, place.bar, place.beat, playback.position);
  if (mode === 'select') {
    loop.select(writtenBarNumber(score, place.bar), writtenBarNumber(score, toBar), time);
  } else {
    loop.jumpTo(time);
    for (const view of views()) view.followMusic();
  }
}

/** The bar under the pointer, shaded on every line (one cut by a line's end is on two). */
function hover(bar: number | null): void {
  for (const view of views()) view.setHover(bar);
}

function onPointerLeave(): void {
  hover(null);
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
    :style="{ '--lines': count }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerLeave"
  >
    <StaffLine v-for="over in count" :key="over" ref="lines" :page="page" :picked="picked ?? null" :over="over - 1" :under="count - over" />
  </div>
</template>

<style scoped>
.staff {
  display: grid;
  /* (Lines of one height: each the same staff, in the middle of its own.) */
  grid-template-rows: repeat(var(--lines), minmax(0, 1fr));
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
