<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import type { Hand } from '../../domain/note';
import type { NoteValue } from '../../domain/notation/noteValue';
import { barAt, barNumber, tempoMarkAt, writtenBeatAt } from '../../domain/score';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useBarLoop } from '../composables/useBarLoop';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

const SEEK_STEPS = 1000;
/** How long the metronome's dot stays lit after a click, in seconds. */
const PULSE_SECONDS = 0.1;

const { playback, barLoop } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const loaded = computed(() => state.value.score !== null);
/** Bar numbers as printed: a pickup is bar 0, so the first and last numbers depend on the score. */
const firstBar = computed(() => (state.value.score ? barNumber(state.value.score, 0) : 1));
const lastBar = computed(() => (state.value.score ? barNumber(state.value.score, state.value.score.bars.length - 1) : 1));

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
    : t('barPosition', { current: barNumber(state.value.score!, currentBar.value), total: lastBar.value }),
);
const seekInput = useTemplateRef<HTMLInputElement>('seek');
let seeking = false;

/** Notes for the tempo readout ("♩ = 90"), in the interface's own font. */
const NOTE_SIGNS: Record<NoteValue, string> = {
  whole: '𝅝',
  half: '𝅗𝅥',
  quarter: '♩',
  eighth: '♪',
  sixteenth: '𝅘𝅥𝅯',
  thirtySecond: '𝅘𝅥𝅰',
};

/** The tempo the music is played at now, the slider applied: "♩ = 45" at 50% of ♩ = 90. Empty without a tempo mark. */
const actualTempo = ref('');

/** The metronome's dot flashes with each click it plays (or the count-in plays). */
const pulse = ref<'none' | 'beat' | 'accent'>('none');

useAnimationFrame(() => {
  const click = playback.playing ? playback.lastClick : null;
  const now = click && click.age < PULSE_SECONDS ? (click.accent ? 'accent' : 'beat') : 'none';
  if (now !== pulse.value) pulse.value = now;

  const score = playback.score;
  if (!score) return;
  const position = playback.position;
  const mark = tempoMarkAt(score, writtenBeatAt(score, position));
  const tempo = mark ? `${NOTE_SIGNS[mark.unit.value]}${mark.unit.dots ? '.' : ''} = ${Math.round(mark.perMinute * playback.tempo)}` : '';
  if (tempo !== actualTempo.value) actualTempo.value = tempo;
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
      <output class="readout">{{ tempoPercent }}%<template v-if="actualTempo"> · {{ actualTempo }}</template></output>
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

      <button
        class="toggle metronome"
        :class="`pulse-${pulse}`"
        :aria-pressed="state.metronome"
        :title="t('metronomeHint')"
        @click="playback.setMetronomeEnabled(!state.metronome)"
      >
        <span class="dot" aria-hidden="true" />
        {{ t('metronome') }}
      </button>

      <div class="loop">
        <button class="toggle" :aria-pressed="loopEnabled" :disabled="!loaded" :title="t('loopBars')" @click="loopEnabled = !loopEnabled">
          ↻ {{ t('loop') }}
        </button>
        <input v-model.number="loopFrom" class="number" type="number" :min="firstBar" :max="lastBar" :aria-label="t('loopFrom')" />
        –
        <input v-model.number="loopTo" class="number" type="number" :min="firstBar" :max="lastBar" :aria-label="t('loopTo')" />
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
  /* Keep clear of the home indicator and, in landscape, the notch. */
  padding: 10px max(16px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
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

.metronome .dot {
  color: var(--muted);
  transition: scale 0.08s ease-out;
}

.metronome.pulse-beat .dot,
.metronome.pulse-accent .dot {
  color: var(--accent);
  background: currentColor;
}

.metronome.pulse-accent .dot {
  scale: 1.35;
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
