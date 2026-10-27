<script setup lang="ts">
import { defineAsyncComponent, onUnmounted, ref, watch } from 'vue';
import { demoPieceId } from '../application/use-cases/Library';
import { usePlaybackState } from './app/usePlaybackState';
import { useDeps } from './deps';
import { useI18n } from './i18n/useI18n';
import { useLibrary } from './app/useLibrary';
import { createNavigation } from './navigation/navigation';
import { usePieceKeys } from './navigation/shortcuts';
import FreePlayScreen from './screens/FreePlayScreen.vue';
import LibraryScreen from './screens/LibraryScreen.vue';
import PieceScreen from './screens/PieceScreen.vue';

/*
 * The shell: which screen is shown, and what works on every screen: a file dropped onto the
 * window, and the keys of the computer's keyboard (navigation/shortcuts.ts).
 */

/** The page of the design system: in development only, and not a part of what is built for use. */
const DesignScreen = import.meta.env.DEV ? defineAsyncComponent(() => import('./screens/DesignScreen.vue')) : null;

const { playback, library } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const dragging = ref(false);

const navigation = createNavigation(
  // (A piece's screen needs a piece; the design's page is there in development; the others need nothing.)
  (screen) => (screen === 'piece' ? playback.score !== null : screen !== 'design' || DesignScreen !== null),
  () => library.current,
  // An address that names another piece than the open one (a reload, a bookmark, the browser's Forward): that piece is opened.
  (piece) => void library.open(piece),
);
const { screen } = navigation;
onUnmounted(() => navigation.dispose());

// A piece that has just opened is shown, under its own address; leaving it for the library, the music stops.
const shelf = useLibrary(library);
watch([() => state.value.score, () => shelf.value.current], ([score, current], [scoreBefore]) => {
  // (Not when the open piece is merely taken off the shelf: it has no name any more, and nothing has opened.)
  if (score && (score !== scoreBefore || current !== null)) navigation.go('piece');
});

watch(screen, (shown) => {
  if (shown !== 'piece') playback.pause();
});

async function openFile(file: File): Promise<void> {
  await library.openFile(file.name, await file.arrayBuffer());
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
}

usePieceKeys(() => screen.value === 'piece');
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
    <FreePlayScreen v-else-if="screen === 'play'" @back="navigation.go('library')" />
    <component :is="DesignScreen" v-else-if="screen === 'design' && DesignScreen" @back="navigation.go('library')" />
    <LibraryScreen v-else @file="openFile" @piece="library.open($event)" @demo="library.open(demoPieceId($event))" @play="navigation.go('play')" />
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
  inset: var(--space-3);
  z-index: 10;
  display: grid;
  place-items: center;
  border: var(--stroke) dashed var(--accent);
  border-radius: var(--radius-m);
  background: var(--drop-overlay);
  font-size: var(--text-l);
  pointer-events: none;
}
</style>
