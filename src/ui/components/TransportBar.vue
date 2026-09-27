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
  <footer class="bar">
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
    <span class="readout">{{ barLabel }}</span>
    <input
      ref="seek"
      class="seek"
      type="range"
      min="0"
      :max="SEEK_STEPS"
      value="0"
      :disabled="!loaded"
      @input="onSeek"
      @change="onSeekEnd"
    />

    <label class="group">
      {{ t('tempo') }}
      <input v-model.number="tempoPercent" type="range" min="25" max="150" step="5" />
      <output class="readout">{{ tempoPercent }}%</output>
    </label>

    <label v-for="{ hand, label } in hands" :key="hand" class="group" :class="`hand-${hand}`">
      <input
        type="checkbox"
        :checked="state.hands[hand]"
        @change="playback.setHandEnabled(hand, ($event.target as HTMLInputElement).checked)"
      />
      {{ t(label) }}
    </label>

    <span class="group">
      <label><input v-model="loopEnabled" type="checkbox" :disabled="!loaded" /> {{ t('loopBars') }}</label>
      <input v-model.number="loopFrom" class="number" type="number" min="1" :max="barCount" />
      –
      <input v-model.number="loopTo" class="number" type="number" min="1" :max="barCount" />
    </span>
  </footer>
</template>

<style scoped>
.bar {
  border-top: 1px solid var(--border);
}

.readout {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 4.5em;
}

.seek {
  flex: 1;
  min-width: 120px;
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

.hand-right input {
  accent-color: var(--right);
}

.hand-left input {
  accent-color: var(--left);
}
</style>
