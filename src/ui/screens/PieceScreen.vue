<script setup lang="ts">
import ScreenHeader from '../components/ScreenHeader.vue';
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
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useDeps } from '../deps';

/* Learning a piece: the stage (the staff, the falling notes, or both) with the transport under it. */

const emit = defineEmits<{ back: [] }>();

const { playback, openScore, library, demos } = useDeps();
const viewMode = useShownViewMode();
const { title, details, error } = usePieceText(playback, openScore, library, demos);

// A phone on its side: the header and the transport leave the screen to the music while it plays.
const state = usePlaybackState(playback);
const { immersed, wake } = useImmersion(
  useMediaQuery(SHORT_SCREEN),
  computed(() => state.value.playing),
);

/*
 * While they are away the staff keeps the height it had beside them, in the middle of the room they
 * leave, as the falling notes keep the size of their keys: a staff of another height is laid out
 * anew, and that is seen as a jolt. It is let go once they are back in place.
 */
const stage = useTemplateRef<HTMLElement>('stage');
const staffHeight = ref<number | null>(null);
watch(
  immersed,
  (on) => {
    const height = stage.value?.querySelector<HTMLElement>('.staff')?.clientHeight ?? 0;
    if (on && height > 0) staffHeight.value = height;
  },
  // (Measured before the strips start to go.)
  { flush: 'pre' },
);
const stripsSettled = () => {
  if (!immersed.value) staffHeight.value = null;
};
</script>

<template>
  <div class="piece" :class="{ immersed }" @pointerdown.capture="wake">
    <div class="strip" @transitionend.self="stripsSettled" @transitioncancel.self="stripsSettled">
      <div class="fold">
        <!-- A file dropped here that did not open: said in place of the title, as the piece stays. -->
        <ScreenHeader class="bar" back :alert="!!error" @back="emit('back')">
          <template #title>
            <template v-if="error">{{ error }}</template>
            <!-- (How long the piece is: said where there is room for it.) -->
            <template v-else>{{ title }}<span v-if="details" class="details"> · {{ details }}</span></template>
          </template>
          <!-- The view is chosen often enough to stand here; where there is no room for it, the settings panel has it. -->
          <ViewModeSwitch class="view-switch" />
          <SettingsPanel piece />
        </ScreenHeader>
      </div>
    </div>

    <main ref="stage" class="stage" :class="`view-${viewMode}`">
      <StaffView v-if="viewMode !== 'keys'" class="view staff" :class="{ held: staffHeight }" :style="staffHeight ? { height: `${staffHeight}px` } : undefined" />
      <PianoRoll v-if="viewMode !== 'staff'" class="view" />
      <CountInOverlay />
      <InstrumentNotice />
      <!-- The first touch of an immersed stage only brings the header and the transport back: it does not jump in the music. -->
      <div v-if="immersed" class="waker" />
    </main>

    <div class="strip" @transitionend.self="stripsSettled" @transitioncancel.self="stripsSettled">
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
  /* (One column no wider than the screen: a long title is cut short, and does not widen its strip.) */
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  transition: grid-template-rows var(--medium) var(--glide);
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

/* A phone on its side: a thin header. */
@media (max-height: 500px) {
  .bar {
    padding-block: max(var(--space-1), env(safe-area-inset-top)) var(--space-1);
  }
}

/* A phone: the name alone. */
@media (max-width: 599px) {
  .details {
    display: none;
  }
}

.view-switch {
  flex: none;
}

/* Under this width the view switch no longer fits beside the title: the settings panel has it then (see components/SettingsPanel.vue). */
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
  /* (The staff: a little over a third of the height, and never too low to hold both its staves.) */
  grid-template-rows: minmax(160px, 38%) 1fr;
}

.view {
  min-height: 0;
}

.held {
  align-self: center;
}

/* (The room around a staff held in the middle is its paper too.) */
.stage:has(.held) {
  background: var(--surface);
}

.view-both .staff {
  border-bottom: 1px solid var(--border);
}

/* (How long the piece is: a note beside the title, not a part of it.) */
.details {
  font-family: var(--font-text);
  font-weight: normal;
}
</style>
