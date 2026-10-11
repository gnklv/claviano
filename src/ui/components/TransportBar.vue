<script setup lang="ts">
import AppButton from './AppButton.vue';
import TextField from './TextField.vue';
import ToggleChip from './ToggleChip.vue';
import { computed, ref, useTemplateRef } from 'vue';
import { barAt, barNumber } from '../../domain/score';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useBarLoop } from '../composables/useBarLoop';
import { SMALL_SCREEN, useMediaQuery } from '../composables/useMediaQuery';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import PracticeToggles from './PracticeToggles.vue';
import SheetDialog from './SheetDialog.vue';
import TempoControl from './TempoControl.vue';

const SEEK_STEPS = 1000;
const { playback, barLoop } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const loaded = computed(() => state.value.score !== null);
/** A phone: no room in the bar for what is set once a session; it goes into a sheet behind "⋯". */
const phone = useMediaQuery(SMALL_SCREEN);
const practiceSheet = useTemplateRef('practiceSheet');
/** Bar numbers as printed: a pickup is bar 0, so the first and last numbers depend on the score. */
const firstBar = computed(() => (state.value.score ? barNumber(state.value.score, 0) : 1));
const lastBar = computed(() => (state.value.score ? barNumber(state.value.score, state.value.score.bars.length - 1) : 1));

// --- Position readouts: updated from the animation frame, only when they actually change. ---

/** Current bar, zero-based; null until a score is loaded. */
const currentBar = ref<number | null>(null);
const barLabel = computed(() =>
  currentBar.value === null
    ? t('barPositionEmpty')
    : t('barPosition', { current: barNumber(state.value.score!, currentBar.value), total: lastBar.value }),
);
const seekInput = useTemplateRef<HTMLInputElement>('seek');
let seeking = false;

useAnimationFrame(() => {
  const score = playback.score;
  if (!score) return;
  const position = playback.position;
  const bar = barAt(score, position);
  if (bar !== currentBar.value) currentBar.value = bar;
  if (!seeking && seekInput.value && score.duration > 0) {
    seekInput.value.value = String(Math.round((position / score.duration) * SEEK_STEPS));
  }
  // (The slider is inked as far as the music has got: see the slider's styles.)
  if (seekInput.value && score.duration > 0) {
    const inked = `${Math.round((position / score.duration) * 1000) / 10}%`;
    if (inked !== seekInput.value.style.getPropertyValue('--fill')) seekInput.value.style.setProperty('--fill', inked);
  }
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
  <footer class="transport">
    <div class="playback">
      <AppButton
        variant="primary"
        :icon="state.playing ? 'pause' : 'play'"
        :disabled="!loaded"
        :label="t(state.playing ? 'pause' : 'play')"
        :hint="`${t(state.playing ? 'pause' : 'play')} (${t('playHint')})`"
        @click="togglePlay"
      />
      <input
        ref="seek"
        class="seek"
        type="range"
        min="0"
        :max="SEEK_STEPS"
        value="0"
        :disabled="!loaded"
        :aria-label="barLabel"
        @input="onSeek"
        @change="onSeekEnd"
      />
      <span class="readout">{{ barLabel }}</span>
    </div>

    <TempoControl class="tempo" />

    <div class="loop">
      <ToggleChip v-model:pressed="loopEnabled" icon="loop" :disabled="!loaded" :title="t('loopBars')">{{ t('loop') }}</ToggleChip>
      <TextField v-model="loopFrom" class="number" type="number" :min="firstBar" :max="lastBar" :label="t('loopFrom')" />
      –
      <TextField v-model="loopTo" class="number" type="number" :min="firstBar" :max="lastBar" :label="t('loopTo')" />
      <template v-if="phone">
        <AppButton class="more" icon="more" :label="t('practice')" @click="practiceSheet?.open()" />
        <SheetDialog ref="practiceSheet" :title="t('practice')">
          <PracticeToggles tiled />
        </SheetDialog>
      </template>
    </div>

    <PracticeToggles v-if="!phone" class="in-bar" />
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
  gap: var(--space-2) var(--space-5);
  /* Keep clear of the home indicator and, in landscape, the notch. */
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-2), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  background: var(--panel);
  border-top: 1px solid var(--border);
}

/* Wider: what is always at hand in one row, what is set once a session in a row under it. */
@media (min-width: 600px) {
  .transport {
    grid-template-columns: 1fr auto auto;
    grid-template-areas:
      'playback tempo loop'
      'practice practice practice';
  }
}

/* Everything in one row, from the width at which all of it fits in one (a tablet on its side, and wider). */
@media (min-width: 1150px) {
  .transport {
    grid-template-columns: 1fr auto auto auto;
    grid-template-areas: 'playback tempo loop practice';
    /* (A tablet on its side is just this wide: closer together, and the place in the piece keeps its length.) */
    column-gap: var(--space-4);
  }
}

/* A phone on its side: one thin row (practice is behind "⋯"), every pixel of height is the music's. */
@media (max-height: 500px) {
  .transport {
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'playback tempo loop';
    column-gap: var(--space-3);
    padding-block: var(--space-1) max(var(--space-1), env(safe-area-inset-bottom));
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
  flex: 1;
  min-width: 80px;
}

.readout {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  white-space: nowrap;
}

.number {
  width: 3.5em;
}

/* Phones: the tempo, the loop and "⋯" have one row between them. */
@media (max-width: 599px) {
  .number {
    width: 3em;
  }

  .transport {
    column-gap: var(--space-2);
  }
}
</style>
