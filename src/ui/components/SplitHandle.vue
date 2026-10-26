<script setup lang="ts">
import { ref } from 'vue';

/*
 * The line between two parts of a column (the staff over the falling notes), held and drawn up or
 * down to share the height between them: `share` is the upper part's, in percent of what holds the
 * line, within `min` and `max`. A double press asks for the share it had to begin with (`reset`).
 * From the keys: reached with Tab, moved by the arrows up and down.
 *
 * Seen, it is the line of an edge; to be taken hold of, it reaches further than it is seen: a
 * fingertip's breadth under a finger.
 */
const props = defineProps<{ min: number; max: number; /** What it divides, read out. */ label: string }>();
const share = defineModel<number>('share', { required: true });
const emit = defineEmits<{ reset: [] }>();

/** The arrows move it by this much of the height: a step that is seen, in a few presses from end to end. */
const STEP = 5;

const within = (value: number) => Math.min(props.max, Math.max(props.min, value));
const dragging = ref(false);

function take(event: PointerEvent): void {
  if (event.button !== 0) return;
  const line = event.currentTarget as HTMLElement;
  // (Held: it follows the pointer wherever it goes, over the parts or off them.)
  line.setPointerCapture(event.pointerId);
  dragging.value = true;
  // (Nothing selected as it is drawn; and so, pressed, it takes the keys itself: the arrows move it next.)
  event.preventDefault();
  line.focus({ preventScroll: true });
}

function draw(event: PointerEvent): void {
  if (!dragging.value) return;
  const room = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
  if (!room || room.height <= 0) return;
  share.value = within(((event.clientY - room.top) / room.height) * 100);
}

function letGo(): void {
  dragging.value = false;
}

function key(event: KeyboardEvent): void {
  const by = { ArrowUp: -STEP, ArrowDown: STEP }[event.key];
  if (by === undefined) return;
  event.preventDefault();
  share.value = within(share.value + by);
}
</script>

<template>
  <div
    class="split-handle"
    :class="{ dragging }"
    role="separator"
    aria-orientation="horizontal"
    tabindex="0"
    :aria-label="label"
    :aria-valuenow="Math.round(share)"
    :aria-valuemin="min"
    :aria-valuemax="max"
    @pointerdown="take"
    @pointermove="draw"
    @pointerup="letGo"
    @pointercancel="letGo"
    @dblclick="emit('reset')"
    @keydown="key"
  />
</template>

<style scoped>
.split-handle {
  position: relative;
  z-index: 1;
  /* (Short of the sides by its ring's room: the stage cuts off what reaches past its edges.) */
  margin-inline: calc(var(--focus-width) + var(--focus-gap));
  background: var(--border);
  cursor: row-resize;
  /* (Drawn by the finger, not scrolled with it.) */
  touch-action: none;
}

/* What can be taken hold of: a little either side of the line, under a pointer; a fingertip's breadth under a finger. */
.split-handle::before {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--space-2)) 0;
}

@media (pointer: coarse) {
  .split-handle::before {
    inset: calc((1px - var(--touch)) / 2) 0;
  }
}

/* Reached for or held: the line in ink, a little thicker. (Reached by the keys, it is ringed as all else is.) */
.split-handle.dragging {
  background: var(--muted);
  box-shadow: 0 0 0 1px var(--muted);
}

@media (hover: hover) {
  .split-handle:hover {
    background: var(--muted);
    box-shadow: 0 0 0 1px var(--muted);
  }
}
</style>
