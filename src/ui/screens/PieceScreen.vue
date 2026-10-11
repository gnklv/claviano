<script setup lang="ts">
import CountInOverlay from '../components/CountInOverlay.vue';
import InstrumentNotice from '../components/InstrumentNotice.vue';
import PianoRoll from '../components/PianoRoll.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import StaffView from '../components/StaffView.vue';
import TransportBar from '../components/TransportBar.vue';
import ViewModeSwitch from '../components/ViewModeSwitch.vue';
import { useImmersion } from '../composables/useImmersion';
import { SHORT_SCREEN, useMediaQuery } from '../composables/useMediaQuery';
import { usePieceText } from '../composables/usePieceText';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useShownViewMode } from '../composables/useViewMode';
import { computed } from 'vue';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/* Learning a piece: the stage (the staff, the falling notes, or both) with the transport under it. */

const emit = defineEmits<{ back: [] }>();

const { playback, openScore, library, demos } = useDeps();
const { t } = useI18n();
const viewMode = useShownViewMode();
const { title, details, error } = usePieceText(playback, openScore, library, demos);

// A phone on its side: the header and the transport leave the screen to the music while it plays.
const state = usePlaybackState(playback);
const { immersed, wake } = useImmersion(
  useMediaQuery(SHORT_SCREEN),
  computed(() => state.value.playing),
);
</script>

<template>
  <div class="piece" :class="{ immersed }" @pointerdown.capture="wake">
    <div class="strip">
      <div class="fold">
        <header class="bar">
          <button class="button back" :title="t('backToLibrary')" :aria-label="t('backToLibrary')" @click="emit('back')">←</button>
          <!-- A file dropped here that did not open: said in place of the title, as the piece stays. -->
          <span v-if="error" class="title failed" role="alert">{{ error }}</span>
          <!-- (How long the piece is: said where there is room for it.) -->
          <span v-else class="title">{{ title }}<span v-if="details" class="details"> · {{ details }}</span></span>
          <!-- The view is chosen often enough to stand here; where there is no room for it, the settings panel has it. -->
          <ViewModeSwitch class="view-switch" />
          <SettingsPanel piece />
        </header>
      </div>
    </div>

    <main class="stage" :class="`view-${viewMode}`">
      <StaffView v-if="viewMode !== 'keys'" class="view staff" />
      <PianoRoll v-if="viewMode !== 'staff'" class="view" />
      <CountInOverlay />
      <InstrumentNotice />
      <!-- The first touch of an immersed stage only brings the header and the transport back: it does not jump in the music. -->
      <div v-if="immersed" class="waker" />
    </main>

    <div class="strip">
      <div class="fold">
        <TransportBar />
      </div>
    </div>
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

/*
 * The header and the transport each stand in a strip that can fold to nothing (a row of 1fr going
 * to 0fr can be animated; a row of `auto` cannot), and the stage takes the room.
 */
.strip {
  display: grid;
  grid-template-rows: 1fr;
  min-height: 0;
  transition: grid-template-rows 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.fold {
  min-height: 0;
}

/*
 * Folded, nothing of them is left in sight: not their padding, not a border. (Only where they
 * fold: on a taller screen the transport's tempo panel stands out over its edge.)
 */
@media (max-height: 500px) {
  .fold {
    overflow: hidden;
  }
}

.immersed .strip {
  grid-template-rows: 0fr;
}

.waker {
  position: absolute;
  inset: 0;
}

@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}

/* A phone on its side: a thin header. */
@media (max-height: 500px) {
  .bar {
    padding-block: max(4px, env(safe-area-inset-top)) 4px;
  }
}

.bar {
  /* The title never wraps under the buttons: one row, whatever the width. */
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--border);
}

.back {
  flex: none;
  min-width: 40px;
  padding-inline: 10px;
  font-size: var(--text-glyph);
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

/* A phone: the name alone. */
@media (max-width: 599px) {
  .details {
    display: none;
  }
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
</style>
