<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue';
import type { Hand } from '../../domain/note';
import { barAt, barRange } from '../../domain/score';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

const SEEK_STEPS = 1000;

const { playback } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const loaded = computed(() => state.value.score !== null);
const barCount = computed(() => state.value.score?.bars.length ?? 0);

const tempoPercent = computed({
  get: () => Math.round(state.value.tempo * 100),
  set: (percent: number) => playback.setTempo(percent / 100),
});

const hands: { hand: Hand; label: MessageKey }[] = [
  { hand: 'right', label: 'rightHand' },
  { hand: 'left', label: 'leftHand' },
];

// --- Position readouts: updated from the animation frame, only when they actually change. ---

/** Current bar, zero-based; null until a score is loaded. */
const currentBar = ref<number | null>(null);
const barLabel = computed(() =>
  currentBar.value === null
    ? t('barPositionEmpty')
    : t('barPosition', { current: currentBar.value + 1, total: barCount.value }),
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

const loopEnabled = ref(false);
const loopFrom = ref(1);
const loopTo = ref(4);

watch([loopEnabled, loopFrom, loopTo], () => {
  const score = playback.score;
  if (!score) return;
  playback.setLoop(loopEnabled.value ? barRange(score, loopFrom.value - 1, loopTo.value - 1) : null);
});

// Loading a new score resets the loop in Playback; keep the checkbox in sync.
watch(
  () => state.value.score,
  () => (loopEnabled.value = false),
);

function togglePlay(): void {
  if (playback.playing) playback.pause();
  else void playback.play();
}
</script>

<template>
  <!--
    Three groups by meaning: playback, tempo, practice (hands and loop).
    How they are arranged depends on the width; see the grid areas below.
  -->
  <footer class="transport">
    <div class="playback">
      <button
        class="button primary"
        :disabled="!loaded"
        :title="`${t(state.playing ? 'pause' : 'play')} (${t('playHint')})`"
        :aria-label="t(state.playing ? 'pause' : 'play')"
        @click="togglePlay"
      >
        {{ state.playing ? '❚❚' : '▶' }}
      </button>
      <button class="button" :disabled="!loaded" :title="t('stop')" :aria-label="t('stop')" @click="playback.stop()">
        ■
      </button>
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

    <label class="tempo">
      {{ t('tempo') }}
      <input v-model.number="tempoPercent" class="tempo-slider" type="range" min="25" max="150" step="5" />
      <output class="readout">{{ tempoPercent }}%</output>
    </label>

    <div class="practice">
      <div class="hands">
        <button
          v-for="{ hand, label } in hands"
          :key="hand"
          class="toggle"
          :class="`hand-${hand}`"
          :aria-pressed="state.hands[hand]"
          @click="playback.setHandEnabled(hand, !state.hands[hand])"
        >
          <span class="dot" aria-hidden="true" />
          {{ t(label) }}
        </button>
      </div>

      <div class="loop">
        <button class="toggle" :aria-pressed="loopEnabled" :disabled="!loaded" :title="t('loopBars')" @click="loopEnabled = !loopEnabled">
          ↻ {{ t('loop') }}
        </button>
        <input v-model.number="loopFrom" class="number" type="number" min="1" :max="barCount" :aria-label="t('loopFrom')" />
        –
        <input v-model.number="loopTo" class="number" type="number" min="1" :max="barCount" :aria-label="t('loopTo')" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* Phones: one group per row, each full width. */
.transport {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    'playback'
    'tempo'
    'practice';
  gap: 10px 24px;
  padding: 10px 16px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}

/* Tablets and narrow windows: playback on top, tempo and practice share the second row. */
@media (min-width: 600px) {
  .transport {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'playback playback'
      'tempo practice';
  }
}

/* Wide screens: everything in one row. */
@media (min-width: 1100px) {
  .transport {
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'playback tempo practice';
  }
}

.playback,
.tempo,
.practice,
.hands,
.loop {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.playback {
  grid-area: playback;
}

.tempo {
  grid-area: tempo;
}

.practice {
  grid-area: practice;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 16px;
}

.seek,
.tempo-slider {
  flex: 1;
  min-width: 80px;
}

@media (min-width: 1100px) {
  .tempo-slider {
    flex: 0 1 140px;
  }
}

.readout {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  white-space: nowrap;
}

/* A pressable chip: on when aria-pressed is true, faded when off. */
.toggle {
  appearance: none;
  display: inline-flex;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 5px 12px;
  font: inherit;
  cursor: pointer;
}

.toggle[aria-pressed='true'] {
  background: var(--control);
  color: var(--text);
}

.toggle:disabled {
  opacity: 0.4;
  cursor: default;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid currentColor;
}

.hand-right .dot {
  color: var(--right);
}

.hand-left .dot {
  color: var(--left);
}

.toggle[aria-pressed='true'] .dot {
  background: currentColor;
}

.number {
  width: 3.5em;
  background: var(--control);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 4px;
  font: inherit;
}

/* Phones: finger-sized targets. */
@media (max-width: 599px) {
  .button,
  .toggle,
  .number {
    min-height: 44px;
  }

  .button {
    min-width: 44px;
  }

  /* Safari on iOS zooms into inputs with text smaller than 16px when they get focus. */
  .number {
    font-size: 16px;
  }
}
</style>
