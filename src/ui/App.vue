<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ScoreLoadError, type ScoreLoadErrorCode } from '../application/ports/ScoreParser';
import { barAt, barNumber, type Score } from '../domain/score';
import DemoMenu from './components/DemoMenu.vue';
import InstrumentNotice from './components/InstrumentNotice.vue';
import LanguageSwitch from './components/LanguageSwitch.vue';
import CountInOverlay from './components/CountInOverlay.vue';
import PianoRoll from './components/PianoRoll.vue';
import PracticeSettings from './components/PracticeSettings.vue';
import StaffView from './components/StaffView.vue';
import SettingsMenu from './components/SettingsMenu.vue';
import ThemeSwitch from './components/ThemeSwitch.vue';
import TransportBar from './components/TransportBar.vue';
import ViewModeSwitch from './components/ViewModeSwitch.vue';
import { rememberPracticeSettings } from './composables/rememberPracticeSettings';
import { usePlaybackState } from './composables/usePlaybackState';
import { useViewMode } from './composables/useViewMode';
import { useDeps, type Demo } from './deps';
import type { MessageKey } from './i18n/en';
import { useI18n } from './i18n/useI18n';

const ERROR_MESSAGES: Record<ScoreLoadErrorCode, MessageKey> = {
  'unsupported-format': 'errorUnsupportedFormat',
  'invalid-file': 'errorInvalidFile',
  'unsupported-feature': 'errorUnsupportedFeature',
};

const { playback, instrument, loadScore, demos } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
rememberPracticeSettings(playback, instrument);
const viewMode = useViewMode();
const dragging = ref(false);

/** The open demo, if any: its title comes from the dictionary, so it follows a language switch. */
let openDemoInfo: { score: Score; demo: Demo } | null = null;

/** Kept as data, not text, so the message follows a language switch. */
const loadError = ref<{ file: string; reason: MessageKey } | null>(null);

const title = computed(() => {
  if (loadError.value) {
    return t('openError', { file: loadError.value.file, reason: t(loadError.value.reason) });
  }
  const score = state.value.score;
  if (!score) return t('emptyHint');
  return t('scoreSummary', {
    title: openDemoInfo?.score === score ? t(openDemoInfo.demo.title) : score.title,
    // A pickup is not counted as a bar of its own: the count is the last bar's number.
    bars: t('barsCount', { count: barNumber(score, score.bars.length - 1) }),
    notes: t('notesCount', { count: score.notes.length }),
  });
});

async function openDemo(demo: Demo): Promise<void> {
  try {
    const score = await demo.load();
    openDemoInfo = { score, demo };
    open(score);
  } catch (e) {
    loadError.value = { file: t(demo.title), reason: 'errorUnknown' };
    console.error(e);
  }
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
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  // Typing a bar number is left alone; so are the arrows on a slider (tempo, position), which move it.
  if (input?.type === 'number') return;
  const arrow = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  if (arrow && input) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (playback.playing) playback.pause();
    else void playback.play();
  } else if (arrow) {
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
        <input type="file" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden @change="onFileChosen" />
      </label>
      <DemoMenu :demos="demos" @choose="openDemo" />
      <span class="title">{{ title }}</span>
      <!-- Wide screens show the settings inline; narrow ones tuck them behind ⚙ (see styles below). -->
      <div class="settings-inline">
        <ViewModeSwitch />
        <ThemeSwitch />
        <LanguageSwitch />
        <!-- Only where the ⚙ menu cannot open (no Popover API): see styles below. -->
        <div class="practice-inline"><PracticeSettings /></div>
      </div>
      <SettingsMenu class="settings-menu" />
    </header>

    <main class="stage" :class="[`view-${viewMode}`, { dragging }]" :data-drop-hint="t('dropHint')">
      <StaffView v-if="viewMode !== 'keys'" class="view staff" />
      <PianoRoll v-if="viewMode !== 'staff'" class="view" />
      <CountInOverlay />
      <InstrumentNotice />
    </main>

    <TransportBar />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* One column no wider than the screen: by default it would grow to fit the title's one long line. */
  grid-template-columns: minmax(0, 1fr);
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

.settings-inline {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.practice-inline {
  display: none;
}

/* Below this width the inline settings no longer fit next to the title; the ⚙ menu has them all. */
@media (max-width: 900px) {
  .settings-inline {
    display: none;
  }

  .settings-menu {
    margin-left: auto;
  }

  /* The title gets its own full-width row under the buttons. */
  .title {
    order: 1;
    flex-basis: 100%;
  }
}

/* Narrow phones: the logo, both buttons and ⚙ fit one row with a little less air between them. */
@media (max-width: 420px) {
  .bar:first-child {
    column-gap: 10px;
  }
}

/*
 * Browsers without the Popover API (e.g. iPhones stuck on iOS 16) would show the menu card
 * permanently. There we skip the menu and keep the settings inline, as on wide screens.
 */
@supports not selector(:popover-open) {
  .settings-inline {
    display: inline-flex;
  }

  .practice-inline {
    display: contents;
  }

  .settings-menu {
    display: none;
  }
}

.stage {
  position: relative;
  min-height: 0;
  /* In landscape the notch is on a side; keep the keyboard edges out from under it. */
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
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

/*
 * Short screens (a phone in landscape): every pixel of height goes to the music.
 * The title stays in the button row, and the staff gets a share instead of a fixed minimum.
 * Kept last so it overrides the rules above for the same elements.
 */
@media (max-height: 500px) {
  .title {
    order: 0;
    flex-basis: 0;
  }

  .stage.view-both {
    grid-template-rows: 45% 1fr;
  }
}
</style>
