<script setup lang="ts">
import CountInOverlay from '../components/CountInOverlay.vue';
import InstrumentNotice from '../components/InstrumentNotice.vue';
import PianoRoll from '../components/PianoRoll.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import StaffView from '../components/StaffView.vue';
import TransportBar from '../components/TransportBar.vue';
import ViewModeSwitch from '../components/ViewModeSwitch.vue';
import { usePieceText } from '../composables/usePieceText';
import { useShownViewMode } from '../composables/useViewMode';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/* Learning a piece: the stage (the staff, the falling notes, or both) with the transport under it. */

const emit = defineEmits<{ back: [] }>();

const { playback, openScore, demos } = useDeps();
const { t } = useI18n();
const viewMode = useShownViewMode();
const { summary, error } = usePieceText(playback, openScore, demos);
</script>

<template>
  <div class="piece">
    <header class="bar">
      <button class="button back" :title="t('backToLibrary')" :aria-label="t('backToLibrary')" @click="emit('back')">←</button>
      <!-- A file dropped here that did not open: said in place of the title, as the piece stays. -->
      <span class="title" :class="{ failed: error }" :role="error ? 'alert' : undefined">{{ error ?? summary }}</span>
      <!-- The view is chosen often enough to stand here; where there is no room for it, the settings panel has it. -->
      <ViewModeSwitch class="view-switch" />
      <SettingsPanel piece />
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

.view-switch {
  flex: none;
}

/* Below this width the view switch no longer fits next to the title. */
@media (max-width: 900px) {
  .view-switch {
    display: none;
  }
}

.stage {
  position: relative;
  min-height: 0;
  /* Whatever a view draws, it never lies over the header or the transport. */
  overflow: hidden;
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
