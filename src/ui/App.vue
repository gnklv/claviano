<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ScoreLoadError, type ScoreLoadErrorCode } from '../application/ports/ScoreParser';
import { barAt, type Score } from '../domain/score';
import LanguageSwitch from './components/LanguageSwitch.vue';
import PianoRoll from './components/PianoRoll.vue';
import StaffView from './components/StaffView.vue';
import ThemeSwitch from './components/ThemeSwitch.vue';
import TransportBar from './components/TransportBar.vue';
import ViewModeSwitch from './components/ViewModeSwitch.vue';
import { usePlaybackState } from './composables/usePlaybackState';
import { useViewMode } from './composables/useViewMode';
import { useDeps } from './deps';
import type { MessageKey } from './i18n/en';
import { useI18n } from './i18n/useI18n';

const ERROR_MESSAGES: Record<ScoreLoadErrorCode, MessageKey> = {
  'unsupported-format': 'errorUnsupportedFormat',
  'invalid-file': 'errorInvalidFile',
  'unsupported-feature': 'errorUnsupportedFeature',
};

const { playback, loadScore, demoScore } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const viewMode = useViewMode();
const dragging = ref(false);

/** The demo's title comes from the dictionary, so it follows a language switch too. */
let demo: Score | null = null;

/** Kept as data, not text, so the message follows a language switch. */
const loadError = ref<{ file: string; reason: MessageKey } | null>(null);

const title = computed(() => {
  if (loadError.value) {
    return t('openError', { file: loadError.value.file, reason: t(loadError.value.reason) });
  }
  const score = state.value.score;
  if (!score) return t('emptyHint');
  return t('scoreSummary', {
    title: score === demo ? t('demoTitle') : score.title,
    bars: t('barsCount', { count: score.bars.length }),
    notes: t('notesCount', { count: score.notes.length }),
  });
});

function openDemo(): void {
  demo = demoScore(t('demoTitle'));
  open(demo);
}

function open(score: Score): void {
  loadError.value = null;
  playback.load(score);
}

async function openFile(file: File): Promise<void> {
  try {
    open(loadScore.execute(file.name, await file.arrayBuffer()));
  } catch (e) {
    const reason = e instanceof ScoreLoadError ? ERROR_MESSAGES[e.code] : 'errorUnknown';
    loadError.value = { file: file.name, reason };
    if (!(e instanceof ScoreLoadError)) console.error(e);
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
      <strong class="logo">{{ t('appTitle') }}</strong>
      <label class="button">
        {{ t('openMidi') }}
        <input type="file" accept=".mid,.midi" hidden @change="onFileChosen" />
      </label>
      <button class="button" @click="openDemo">{{ t('demo') }}</button>
      <span class="title">{{ title }}</span>
      <ViewModeSwitch />
      <ThemeSwitch />
      <LanguageSwitch />
    </header>

    <main class="stage" :class="[`view-${viewMode}`, { dragging }]" :data-drop-hint="t('dropHint')">
      <StaffView v-if="viewMode !== 'keys'" class="view staff" />
      <PianoRoll v-if="viewMode !== 'staff'" class="view" />
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
  display: grid;
  grid-template-rows: 1fr;
}

.stage.view-both {
  grid-template-rows: minmax(160px, 38%) 1fr;
}

.view {
  min-height: 0;
}

.view-both .staff {
  border-bottom: 1px solid var(--border);
}

.stage.dragging::after {
  content: attr(data-drop-hint);
  position: absolute;
  inset: 12px;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: 12px;
  background: var(--drop-overlay);
  font-size: 18px;
}
</style>
