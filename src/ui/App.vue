<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { demoPieceId } from '../application/use-cases/Library';
import { stepBar } from '../application/use-cases/stepBar';
import { stepTempo } from '../application/use-cases/stepTempo';
import { usePlaybackState } from './composables/usePlaybackState';
import { useDeps } from './deps';
import { useI18n } from './i18n/useI18n';
import { useLibrary } from './composables/useLibrary';
import { createNavigation } from './navigation/useScreen';
import LibraryScreen from './screens/LibraryScreen.vue';
import PieceScreen from './screens/PieceScreen.vue';

/*
 * The shell: which screen is shown, and what works on every screen: a file dropped onto the
 * window, and the keys of the computer's keyboard.
 */

const { playback, library } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const dragging = ref(false);

const navigation = createNavigation(
  (screen) => screen === 'library' || playback.score !== null,
  () => library.current,
  // An address that names another piece than the open one (a reload, a bookmark, the browser's Forward): that piece is opened.
  (piece) => void library.open(piece),
);
const { screen } = navigation;
onUnmounted(() => navigation.dispose());

// A piece that has just opened is shown, under its own address; leaving it for the library, the music stops.
const shelf = useLibrary(library);
watch([() => state.value.score, () => shelf.value.current], ([score]) => {
  if (score) navigation.go('piece');
});

watch(screen, (shown) => {
  if (shown === 'library') playback.pause();
});

async function openFile(file: File): Promise<void> {
  await library.openFile(file.name, await file.arrayBuffer());
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
}

/** Keys for the tempo: a step slower, a step faster, and back to the piece's own. */
const TEMPO_KEYS: Partial<Record<string, -1 | 0 | 1>> = { Minus: -1, NumpadSubtract: -1, Equal: 1, NumpadAdd: 1, Digit0: 0, Numpad0: 0 };

function onKeyDown(event: KeyboardEvent): void {
  // The keys play the piece: in the library there is nothing for them to do.
  if (screen.value !== 'piece') return;
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  // Typing a bar number is left alone; so are the arrows and Home on a slider (tempo, position), which move it.
  if (input?.type === 'number') return;
  const arrow = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  if ((arrow || event.code === 'Home') && input) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (playback.playing) playback.pause();
    else void playback.play();
  } else if (arrow) {
    event.preventDefault();
    stepBar(playback, event.code === 'ArrowLeft' ? -1 : 1);
  } else if (TEMPO_KEYS[event.code] !== undefined && !event.metaKey && !event.ctrlKey) {
    // (Not with Cmd or Ctrl: those zoom the page.)
    event.preventDefault();
    if (TEMPO_KEYS[event.code] === 0) playback.setTempo(1);
    else stepTempo(playback, TEMPO_KEYS[event.code]!);
  } else if (event.code === 'Home') {
    // To the start (of the loop, when one is on); what plays goes on playing from there.
    event.preventDefault();
    playback.seek(0);
  }
}

/** Otherwise Space would also "click" whichever button or checkbox has focus. */
function onKeyUp(event: KeyboardEvent): void {
  if (screen.value === 'piece' && event.code === 'Space') event.preventDefault();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});
</script>

<template>
  <div
    class="app"
    :class="{ dragging }"
    :data-drop-hint="t('dropHint')"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = !!$event.relatedTarget"
    @drop.prevent="onDrop"
  >
    <PieceScreen v-if="screen === 'piece'" @back="navigation.go('library')" />
    <LibraryScreen v-else @file="openFile" @piece="library.open($event)" @demo="library.open(demoPieceId($event))" />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
}

/* A file held over the window, on any screen. */
.app.dragging::after {
  content: attr(data-drop-hint);
  position: absolute;
  inset: 12px;
  z-index: 10;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: 12px;
  background: var(--drop-overlay);
  font-size: 18px;
  pointer-events: none;
}
</style>
