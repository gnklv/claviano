<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { computed, ref } from 'vue';
import type { Hand } from '../../domain/note';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

/*
 * What is set once for a session of practice: which hands play, the metronome, the count-in
 * before playing, and the pedals (off, to hear whether the fingers alone play legato). In the
 * transport bar where there is room for it; in a sheet of its own on a phone.
 */

/** `tiled`: in a sheet, where they fill the width: the hands in one row, the rest in the next. */
defineProps<{ tiled?: boolean }>();

/** How long the metronome's icon stays lit after a click, in seconds. */
const PULSE_SECONDS = 0.1;

const { playback } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);

const hands: { hand: Hand; label: MessageKey }[] = [
  { hand: 'right', label: 'rightHand' },
  { hand: 'left', label: 'leftHand' },
];

const switches = computed((): { label: MessageKey; on: boolean; set: (on: boolean) => void }[] => [
  { label: 'countIn', on: state.value.countIn, set: (on) => playback.setCountInEnabled(on) },
  { label: 'pedal', on: state.value.pedal, set: (on) => playback.setPedalEnabled(on) },
]);

/** The metronome's icon flashes with each click it plays (or the count-in plays). */
const pulse = ref<'none' | 'beat' | 'accent'>('none');

useAnimationFrame(() => {
  const click = playback.playing ? playback.lastClick : null;
  const now = click && click.age < PULSE_SECONDS ? (click.accent ? 'accent' : 'beat') : 'none';
  if (now !== pulse.value) pulse.value = now;
});
</script>

<template>
  <div class="practice" :class="{ tiled }">
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

    <button
      class="toggle metronome"
      :class="`pulse-${pulse}`"
      :aria-pressed="state.metronome"
      :title="t('metronomeHint')"
      @click="playback.setMetronomeEnabled(!state.metronome)"
    >
      <AppIcon name="metronome" small />
      {{ t('metronome') }}
    </button>

    <button v-for="item in switches" :key="item.label" class="toggle" :aria-pressed="item.on" @click="item.set(!item.on)">
      {{ t(item.label) }}
    </button>
  </div>
</template>

<style scoped>
.practice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tiled {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
}

.tiled .toggle {
  grid-column: span 2;
  justify-content: center;
  padding-inline: 4px;
}

.tiled .toggle[class*='hand-'] {
  grid-column: span 3;
}

.dot {
  flex: none;
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

.metronome .icon {
  color: var(--muted);
}

.metronome.pulse-beat .icon,
.metronome.pulse-accent .icon {
  color: var(--accent);
}

.metronome.pulse-accent .dot {
  scale: 1.35;
}
</style>
