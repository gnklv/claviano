<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import BookmarksPanel from './BookmarksPanel.vue';
import PanelControl from '../components/PanelControl.vue';
import TextField from '../components/TextField.vue';
import ToggleChip from '../components/ToggleChip.vue';
import { computed, useTemplateRef } from 'vue';
import { barAt, barIndexNear, barNumber } from '../../domain/score';
import { useAnimationFrame } from '../browser/useAnimationFrame';
import { useFrameValue } from '../browser/useFrameValue';
import { useBarLoop } from '../app/useBarLoop';
import { useBookmarks } from '../app/useBookmarks';
import { NARROW_SCREEN, SMALL_SCREEN, useMediaQuery } from '../browser/useMediaQuery';
import { usePieceWay } from '../app/usePieceWay';
import { usePracticePlan } from '../app/usePracticePlan';
import { usePlaybackState } from '../app/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import PlanStart from './PlanStart.vue';
import PracticeToggles from './PracticeToggles.vue';
import SheetDialog from '../components/SheetDialog.vue';
import TempoControl from './TempoControl.vue';

/** `fingers`: setting one's own fingers is offered among the tools of practice (`setFingers` asks for it to begin). */
defineProps<{ fingers?: boolean }>();
const emit = defineEmits<{ setFingers: [] }>();

const SEEK_STEPS = 1000;
const { playback, barLoop, bookmarks, way, plan } = useDeps();
const usedWay = usePieceWay(way);
/** The loop is a tool of learning: listened to, the piece is played whole. */
const learning = computed(() => usedWay.value === 'learn');
const { t } = useI18n();
const state = usePlaybackState(playback);
const loaded = computed(() => state.value.score !== null);
/** A phone: no room in the bar for what is set once a session; it goes into a sheet behind "⋯". */
const phone = useMediaQuery(SMALL_SCREEN);
const practiceSheet = useTemplateRef('practiceSheet');
/**
 * A phone held upright: the plan before a step stands in the practice sheet, over the rest (there is
 * no room for a bar over the transport to begin from; see StepBar). A step begun closes the sheet.
 */
const narrow = useMediaQuery(NARROW_SCREEN);
const planned = usePracticePlan(plan);
const planInSheet = computed(() => narrow.value && learning.value && planned.value.steps.length > 0 && planned.value.current === null);
/** Bar numbers as printed: a pickup is bar 0, so the first and last numbers depend on the score. */
const firstBar = computed(() => (state.value.score ? barNumber(state.value.score, 0) : 1));
const lastBar = computed(() => (state.value.score ? barNumber(state.value.score, state.value.score.bars.length - 1) : 1));

// --- Position readouts: updated from the animation frame, only when they actually change. ---

/** Current bar, zero-based; null until a score is loaded. */
const currentBar = useFrameValue(() => (playback.score ? barAt(playback.score, playback.position) : null));
/** Where in the piece the bookmarks are, as shares of its length (the first time their bar is played). */
const marked = useBookmarks(bookmarks);
const marks = computed(() => {
  const score = state.value.score;
  if (!score || score.duration <= 0) return [];
  return marked.value.map((bookmark) => (score.bars[barIndexNear(score, bookmark.bar, 0)] ?? 0) / score.duration);
});

/** The bar the music is in, as numbered on the page (1 before a piece is open). */
const currentBarNumber = computed(() => (currentBar.value === null || !state.value.score ? 1 : barNumber(state.value.score, currentBar.value)));
const barLabel = computed(() =>
  currentBar.value === null
    ? t('barPositionEmpty')
    : t('barPosition', { current: barNumber(state.value.score!, currentBar.value), total: lastBar.value }),
);
const seekInput = useTemplateRef<HTMLInputElement>('seek');
let seeking = false;

/** The step of the slider shown now: the slider is set when the music reaches another, not at every frame. */
let shownStep = -1;

useAnimationFrame(() => {
  const score = playback.score;
  const input = seekInput.value;
  if (!score || !input || score.duration <= 0) return;
  const step = Math.round((playback.position / score.duration) * SEEK_STEPS);
  if (step === shownStep) return;
  shownStep = step;
  if (!seeking) input.value = String(step);
  // (The slider is inked as far as the music has got: see the slider's styles.)
  input.style.setProperty('--fill', `${(step / SEEK_STEPS) * 100}%`);
});

function onSeek(event: Event): void {
  seeking = true;
  const score = playback.score;
  if (score) playback.seek((Number((event.target as HTMLInputElement).value) / SEEK_STEPS) * score.duration);
}

function onSeekEnd(): void {
  seeking = false;
}

// --- Bar loop ---

const loop = useBarLoop(barLoop);
const loopEnabled = loop.enabled;
const loopFrom = computed({ get: () => loop.from.value, set: (bar: number) => barLoop.setFrom(bar) });
const loopTo = computed({ get: () => loop.to.value, set: (bar: number) => barLoop.setTo(bar) });

function togglePlay(): void {
  if (playback.playing) playback.pause();
  else void playback.play();
}
</script>

<template>
  <!--
    Always at hand: playing, the place in the piece, the tempo, the loop. Set once a session:
    the hands, the metronome, the count-in, the pedal; on a phone these are in a sheet behind "⋯".
    (What is touched seldom is in the settings panel.) How the groups are arranged depends on the
    width; see the grid areas below.
  -->
  <!-- (Every button in it a pill, as its chips are: one row of one shape reads as of one height.) -->
  <footer class="transport" :class="{ listening: !learning }">
    <div class="playback">
      <AppButton
        variant="primary"
        pill
        :icon="state.playing ? 'pause' : 'play'"
        :disabled="!loaded"
        :label="t(state.playing ? 'pause' : 'play')"
        :hint="`${t(state.playing ? 'pause' : 'play')} (${t('playHint')})`"
        @click="togglePlay"
      />
      <div class="seek">
        <!-- The bookmarks, where they are in the piece. -->
        <span v-for="(share, index) in marks" :key="index" class="mark" :style="{ '--at': share }" aria-hidden="true" />
      <input
        ref="seek"
        class="slider"
        type="range"
        min="0"
        :max="SEEK_STEPS"
        value="0"
        :disabled="!loaded"
        :aria-label="barLabel"
        @input="onSeek"
        @change="onSeekEnd"
      />
      </div>
      <PanelControl class="readout" pill icon="bookmark" :title="t('bookmarks')" :label="`${barLabel} · ${t('bookmarks')}`" :disabled="!loaded">
        {{ barLabel }}
        <template #panel="{ close }"><BookmarksPanel :bar="currentBarNumber" @done="close" /></template>
      </PanelControl>
    </div>

    <TempoControl class="tempo" />

    <div class="loop">
      <template v-if="learning">
        <ToggleChip v-model:pressed="loopEnabled" class="loop-switch" icon="loop" :disabled="!loaded" :title="t('loopBars')">{{ t('loop') }}</ToggleChip>
        <TextField v-model="loopFrom" class="number" type="number" :min="firstBar" :max="lastBar" :label="t('loopFrom')" />
        –
        <TextField v-model="loopTo" class="number" type="number" :min="firstBar" :max="lastBar" :label="t('loopTo')" />
      </template>
      <template v-if="phone">
        <AppButton class="more" pill icon="more" :label="t('practice')" @click="practiceSheet?.open()" />
        <SheetDialog ref="practiceSheet" :title="t('practice')">
          <PlanStart v-if="planInSheet" @began="practiceSheet?.close()" />
          <PracticeToggles
            tiled
            :fingers="fingers"
            @set-fingers="
              practiceSheet?.close();
              emit('setFingers');
            "
          />
        </SheetDialog>
      </template>
    </div>

    <PracticeToggles v-if="!phone" class="in-bar" :fingers="fingers" @set-fingers="emit('setFingers')" />
  </footer>
</template>

<style scoped>
/* Phones: playing and the place on top; the tempo, the loop and "⋯" under it. Practice is not in the bar. */
.transport {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'playback playback'
    'tempo loop';
  /*
   * One room between everything in the bar, groups or not: in one row it reads as one row of
   * controls, and a wider room between groups read as carelessness. (So nothing in it is quiet: a
   * face that comes only under the pointer leaves room around its words that is not seen.)
   */
  gap: var(--space-2);
  /* Keep clear of the home indicator and, in landscape, the notch. */
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-2), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  background: var(--panel);
  border-top: 1px solid var(--border);
}

/* Wider: what is always at hand in one row, what is set once a session in a row under it. */
@media (min-width: 600px) {
  .transport {
    /* (The place in the piece is never narrower than its slider's least and its bar: they are not drawn over.) */
    grid-template-columns: minmax(min-content, 1fr) auto auto;
    grid-template-areas:
      'playback tempo loop'
      'practice practice practice';
  }
}

/*
 * Everything in one row, from the width at which all of it fits in one: learning, in Russian, with
 * the fingers' chip and the tempo said in full, at the page's 16 px, it fits at 1440 px with the
 * slider some 200 px long, still long enough to find a place by (measured). A tablet on its side is
 * narrower: two rows there.
 */
@media (min-width: 1440px) {
  .transport {
    grid-template-columns: minmax(min-content, 1fr) auto auto auto;
    grid-template-areas: 'playback tempo loop practice';
  }
}

/* A phone on its side: one thin row (practice is behind "⋯"), every pixel of height is the music's. */
@media (max-height: 500px) {
  .transport {
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'playback tempo loop';
    padding-block: var(--space-1) max(var(--space-1), env(safe-area-inset-bottom));
  }
}

/*
 * Listened to, there is no loop: its column goes, and the room on its two sides with it, or the
 * tempo would stand twice as far from what follows it. (On a phone its place holds "⋯": it stays.)
 */
@media (min-width: 600px) and (min-height: 501px) {
  .transport.listening {
    grid-template-columns: minmax(min-content, 1fr) auto;
    grid-template-areas:
      'playback tempo'
      'practice practice';
  }

  .transport.listening .loop {
    display: none;
  }
}

@media (min-width: 1440px) and (min-height: 501px) {
  .transport.listening {
    grid-template-columns: minmax(min-content, 1fr) auto auto;
    grid-template-areas: 'playback tempo practice';
  }
}

.playback,
.loop {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.playback {
  grid-area: playback;
}

.tempo {
  grid-area: tempo;
}

.loop {
  grid-area: loop;
}

/* (Not `.practice`: the toggles in the sheet have that class too, and are no part of this grid.) */
.in-bar {
  grid-area: practice;
}

/* At the far end of the loop's row. */
.more {
  margin-left: auto;
}

/* (No shorter than can be aimed at.) */
.seek {
  position: relative;
  flex: 1;
  min-width: 80px;
  display: grid;
}

.slider {
  /* (Over the bookmarks' strokes: the thumb passes over them.) */
  position: relative;
  width: 100%;
}

/* A bookmark: a short stroke across the track, under the thumb's travel (centred where the thumb would stand). */
.mark {
  position: absolute;
  top: 50%;
  left: calc(var(--slider-thumb) / 2 + var(--at) * (100% - var(--slider-thumb)));
  width: 2px;
  height: var(--space-3);
  translate: -50% -50%;
  border-radius: var(--radius-pill);
  background: var(--muted);
  pointer-events: none;
}

/* (Nothing set here is inherited: the bookmarks' sheet stands inside, and the button keeps to one line itself.) */
.readout {
  flex: none;
}


/* (The loop's word is never cut short: the place in the piece gives way, or the tempo says less.) */
.loop-switch {
  flex: none;
}

.number {
  width: 3.5em;
}

/* Phones: the tempo, the loop and "⋯" have one row between them. */
@media (max-width: 599px) {
  .number {
    width: 3em;
  }
}
</style>
