<script setup lang="ts">
import ToggleChip from './ToggleChip.vue';
import { computed } from 'vue';
import type { Hand } from '../../domain/note';
import { useFrameValue } from '../composables/useFrameValue';
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
const pulse = useFrameValue((): 'none' | 'beat' | 'accent' => {
  const click = playback.playing ? playback.lastClick : null;
  return click && click.age < PULSE_SECONDS ? (click.accent ? 'accent' : 'beat') : 'none';
});
</script>

<template>
  <div class="practice" :class="{ tiled }">
    <ToggleChip v-for="{ hand, label } in hands" :key="hand" :class="`hand-${hand}`" :pressed="state.hands[hand]" @update:pressed="playback.setHandEnabled(hand, $event)">
      <template #sign><span class="dot" aria-hidden="true" /></template>
      {{ t(label) }}
    </ToggleChip>

    <ToggleChip
      class="metronome"
      :class="`pulse-${pulse}`"
      icon="metronome"
      :pressed="state.metronome"
      :title="t('metronomeHint')"
      @update:pressed="playback.setMetronomeEnabled($event)"
    >
      {{ t('metronome') }}
    </ToggleChip>

    <ToggleChip v-for="item in switches" :key="item.label" :pressed="item.on" @update:pressed="item.set($event)">
      {{ t(item.label) }}
    </ToggleChip>
  </div>
</template>

<style scoped>
.practice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/*
 * In a sheet: rows filled from edge to edge, the hands sharing the first. A chip is never narrower
 * than its words: where three do not fit a row (a narrow sheet, a long language), one goes to the next.
 */
.tiled .toggle {
  flex: 1 1 auto;
  justify-content: center;
}

.tiled .toggle[class*='hand-'] {
  flex-basis: 40%;
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

.metronome :deep(.icon) {
  color: var(--muted);
}

.metronome.pulse-beat :deep(.icon),
.metronome.pulse-accent :deep(.icon) {
  color: var(--accent);
}

.metronome.pulse-accent .dot {
  scale: 1.35;
}
</style>
