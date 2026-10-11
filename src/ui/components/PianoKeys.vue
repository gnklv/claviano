<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { isBlackKey } from '../../domain/pitch';
import { BLACK_KEY_WIDTH, keyPlace } from '../../domain/keyboard';
import { useI18n } from '../i18n/useI18n';

/*
 * A keyboard to play on: white keys side by side, black keys over the gaps between them. Fingers
 * (as many as there are), the mouse, and the computer's keyboard press it: two rows of letters
 * laid out as the keys are, the home row white and the row above it black.
 *
 * It tells what is pressed and let go; what sounds is not its business.
 */
const props = defineProps<{
  /** The lowest key shown, and how many keys. */
  lowest: number;
  keys: number;
  /** The keys held now, to light them. */
  pressed: ReadonlySet<number>;
}>();
const emit = defineEmits<{ press: [pitch: number]; release: [pitch: number]; room: [whiteKeys: number]; shift: [octaves: -1 | 1] }>();

const { noteLabel } = useI18n();

/** A white key is no narrower than this, in pixels: a fingertip finds it. */
const MIN_WHITE_PX = 34;

const pitches = computed(() => Array.from({ length: props.keys }, (_, key) => props.lowest + key));
const whites = computed(() => pitches.value.filter((pitch) => !isBlackKey(pitch)));
/** Each black key with where it stands, in white keys from the left. */
const blacks = computed(() => pitches.value.filter(isBlackKey).map((pitch) => ({ pitch, left: keyPlace(pitch, props.lowest).left })));

// --- The computer's keyboard: from the lowest Do, an octave and a third. ---

const LETTERS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
};
const letterOf = (pitch: number): string => {
  const code = Object.entries(LETTERS).find(([, offset]) => offset === pitch - props.lowest)?.[0] ?? '';
  return code === 'Semicolon' ? ';' : code.replace('Key', '');
};
/** The keys of the piano held by keys of the computer: each letter lets go of what it pressed, wherever the keyboard has moved since. */
const byLetter = new Map<string, number>();

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement) return;
  if (event.code === 'KeyZ' || event.code === 'KeyX') {
    emit('shift', event.code === 'KeyZ' ? -1 : 1);
    return;
  }
  const offset = LETTERS[event.code];
  if (offset === undefined || offset >= props.keys || byLetter.has(event.code)) return;
  event.preventDefault();
  byLetter.set(event.code, props.lowest + offset);
  emit('press', props.lowest + offset);
}

function onKeyUp(event: KeyboardEvent): void {
  const pitch = byLetter.get(event.code);
  if (pitch === undefined) return;
  byLetter.delete(event.code);
  emit('release', pitch);
}

/** The window loses the keyboard (another window, another tab): no key-up will come. */
function onBlur(): void {
  for (const pitch of byLetter.values()) emit('release', pitch);
  byLetter.clear();
}

// --- Fingers and the mouse: each holds the key it is over, and slides from key to key. ---

const board = useTemplateRef<HTMLElement>('board');
const byPointer = new Map<number, number>();

function keyAt(event: PointerEvent): number | null {
  const key = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-pitch]');
  return key && board.value?.contains(key) ? Number(key.dataset.pitch) : null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  // (So that the moves and the release come here wherever the finger goes.)
  board.value?.setPointerCapture?.(event.pointerId);
  move(event);
}

function move(event: PointerEvent): void {
  const now = keyAt(event);
  const before = byPointer.get(event.pointerId);
  if (now === (before ?? null)) return;
  if (before !== undefined) emit('release', before);
  if (now === null) byPointer.delete(event.pointerId);
  else {
    byPointer.set(event.pointerId, now);
    emit('press', now);
  }
}

function onPointerMove(event: PointerEvent): void {
  if (byPointer.has(event.pointerId)) move(event);
}

function onPointerUp(event: PointerEvent): void {
  const pitch = byPointer.get(event.pointerId);
  if (pitch === undefined) return;
  byPointer.delete(event.pointerId);
  emit('release', pitch);
}

// --- How many white keys there is room for. ---

const resizeObserver = new ResizeObserver(() => {
  const width = board.value?.clientWidth ?? 0;
  if (width > 0) emit('room', Math.floor(width / MIN_WHITE_PX));
});

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  if (board.value) resizeObserver.observe(board.value);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  resizeObserver.disconnect();
});
</script>

<template>
  <div
    ref="board"
    class="keys"
    :style="{ '--whites': whites.length }"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @contextmenu.prevent
  >
    <div v-for="pitch in whites" :key="pitch" class="key white" :class="{ down: pressed.has(pitch) }" :data-pitch="pitch">
      <span v-if="letterOf(pitch)" class="letter">{{ letterOf(pitch) }}</span>
      <!-- Each Do is named, with its octave: where on the piano this is. -->
      <span v-if="pitch % 12 === 0" class="name">{{ noteLabel(pitch) }}</span>
    </div>
    <div
      v-for="{ pitch, left } in blacks"
      :key="pitch"
      class="key black"
      :class="{ down: pressed.has(pitch) }"
      :data-pitch="pitch"
      :style="{ left: `calc(${left} * 100% / var(--whites))`, width: `calc(${BLACK_KEY_WIDTH} * 100% / var(--whites))` }"
    >
      <span v-if="letterOf(pitch)" class="letter">{{ letterOf(pitch) }}</span>
    </div>
  </div>
</template>

<style scoped>
.keys {
  position: relative;
  display: flex;
  height: 100%;
  /* Every touch here is a key pressed: no scrolling, no zooming, no selecting. */
  touch-action: none;
  user-select: none;
  background: var(--border);
}

.key {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-bottom: 8px;
  cursor: pointer;
}

.white {
  flex: 1;
  min-width: 0;
  border-right: 1px solid var(--key-border);
  border-radius: 0 0 4px 4px;
  background: var(--key-white);
  color: var(--key-label);
}

.black {
  position: absolute;
  top: 0;
  height: 62%;
  border-radius: 0 0 3px 3px;
  background: var(--key-black);
  color: var(--key-label);
}

.white.down {
  background: var(--right);
  color: #fff;
}

.black.down {
  background: color-mix(in srgb, var(--right) 70%, #000);
  color: #fff;
}

/*
 * Two kinds of words on a key, told apart at a glance: the letter of the computer's keyboard is a
 * keycap (a small outlined square, bold), the note's name plain small print at the key's foot.
 */
.letter,
.name {
  line-height: 1;
  pointer-events: none;
}

.letter {
  box-sizing: border-box;
  min-width: 18px;
  padding: 3px 4px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  opacity: 0.75;
}

.name {
  font-size: 10px;
  letter-spacing: 0.02em;
}

/* (A white key with a letter and no name keeps the letter where the others have it.) */
.white .letter:last-child {
  margin-bottom: 14px;
}

.black .letter {
  margin-bottom: 2px;
}

/* The letters are the computer keyboard's: nothing to say where there is only a finger. */
@media (pointer: coarse) {
  .letter {
    display: none;
  }
}
</style>
