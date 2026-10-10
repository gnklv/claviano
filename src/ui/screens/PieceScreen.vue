<script setup lang="ts">
import CountInOverlay from '../components/CountInOverlay.vue';
import InstrumentNotice from '../components/InstrumentNotice.vue';
import LanguageSwitch from '../components/LanguageSwitch.vue';
import PianoRoll from '../components/PianoRoll.vue';
import PracticeSettings from '../components/PracticeSettings.vue';
import SettingsMenu from '../components/SettingsMenu.vue';
import StaffView from '../components/StaffView.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import TransportBar from '../components/TransportBar.vue';
import ViewModeSwitch from '../components/ViewModeSwitch.vue';
import { usePieceText } from '../composables/usePieceText';
import { useViewMode } from '../composables/useViewMode';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/* Learning a piece: the stage (the staff, the falling notes, or both) with the transport under it. */

const emit = defineEmits<{ back: [] }>();

const { playback, openScore, demos } = useDeps();
const { t } = useI18n();
const viewMode = useViewMode();
const { summary, error } = usePieceText(playback, openScore, demos);
</script>

<template>
  <div class="piece">
    <header class="bar">
      <button class="button back" :title="t('backToLibrary')" :aria-label="t('backToLibrary')" @click="emit('back')">←</button>
      <!-- A file dropped here that did not open: said in place of the title, as the piece stays. -->
      <span class="title" :class="{ failed: error }" :role="error ? 'alert' : undefined">{{ error ?? summary }}</span>
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

    <main class="stage" :class="`view-${viewMode}`">
      <StaffView v-if="viewMode !== 'keys'" class="view staff" />
      <PianoRoll v-if="viewMode !== 'staff'" class="view" />
      <CountInOverlay />
      <InstrumentNotice />
    </main>

    <TransportBar />
  </div>
</template>

<style scoped>
.piece {
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* One column no wider than the screen: by default it would grow to fit the title's one long line. */
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
}

.bar:first-child {
  /* The title never wraps under the buttons: one row, whatever the width. */
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--border);
}

.back {
  flex: none;
  min-width: 40px;
  padding-inline: 10px;
  font-size: 16px;
  line-height: 1;
}

.title {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.title.failed {
  color: var(--text);
}

.settings-inline {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px 16px;
}

.practice-inline {
  display: none;
}

.settings-menu {
  flex: none;
}

/* Below this width the inline settings no longer fit next to the title; the ⚙ menu has them all. */
@media (max-width: 900px) {
  .settings-inline {
    display: none;
  }
}

/*
 * Browsers without the Popover API (e.g. iPhones stuck on iOS 16) would show the menu card
 * permanently. There we skip the menu and keep the settings inline, wrapping under the title.
 */
@supports not selector(:popover-open) {
  .bar:first-child {
    flex-wrap: wrap;
  }

  .settings-inline {
    display: inline-flex;
    flex-wrap: wrap;
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

/* Short screens (a phone in landscape): the staff gets a share instead of a fixed minimum. */
@media (max-height: 500px) {
  .stage.view-both {
    grid-template-rows: 45% 1fr;
  }
}
</style>
