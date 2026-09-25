<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { barAt, type Score } from '../domain/score';
import PianoRoll from './components/PianoRoll.vue';
import TransportBar from './components/TransportBar.vue';
import { usePlaybackState } from './composables/usePlaybackState';
import { useDeps } from './deps';

const { playback, loadScore, demoScore } = useDeps();
const state = usePlaybackState(playback);
const error = ref<string | null>(null);
const dragging = ref(false);

const title = computed(() => {
  if (error.value) return error.value;
  const score = state.value.score;
  if (!score) return 'Перетащите .mid файл в окно или нажмите «Демо»';
  return `${score.title} · ${score.bars.length} тактов · ${score.notes.length} нот`;
});

function open(score: Score): void {
  error.value = null;
  playback.load(score);
}

async function openFile(file: File): Promise<void> {
  try {
    open(loadScore.execute(file.name, await file.arrayBuffer()));
  } catch (e) {
    error.value = `Не удалось открыть «${file.name}»: ${(e as Error).message}`;
  }
}

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void openFile(file);
  input.value = '';
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
}

function stepBar(delta: number): void {
  const score = playback.score;
  if (!score) return;
  const target = Math.min(Math.max(barAt(score, playback.position + 0.01) + delta, 0), score.bars.length - 1);
  playback.seek(score.bars[target]);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement && event.target.type === 'number') return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (playback.playing) playback.pause();
    else void playback.play();
  } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    event.preventDefault();
    stepBar(event.code === 'ArrowLeft' ? -1 : 1);
  }
}

/** Otherwise Space would also "click" whichever button or checkbox has focus. */
function onKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') event.preventDefault();
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
    @dragover.prevent="dragging = true"
    @dragleave="dragging = !!$event.relatedTarget"
    @drop.prevent="onDrop"
  >
    <header class="bar">
      <strong class="logo">Claviano</strong>
      <label class="button">
        Открыть MIDI
        <input type="file" accept=".mid,.midi" hidden @change="onFileChosen" />
      </label>
      <button class="button" @click="open(demoScore())">Демо</button>
      <span class="title">{{ title }}</span>
    </header>

    <main class="stage" :class="{ dragging }">
      <PianoRoll />
    </main>

    <TransportBar />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;
}

.bar:first-child {
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 16px;
  letter-spacing: 0.02em;
}

.title {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.stage {
  position: relative;
  min-height: 0;
}

.stage.dragging::after {
  content: 'Отпустите, чтобы открыть';
  position: absolute;
  inset: 12px;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: 12px;
  background: rgb(79 157 255 / 0.08);
  font-size: 18px;
}
</style>
