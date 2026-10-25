<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import AppIcon from '../components/AppIcon.vue';
import ToggleChip from '../components/ToggleChip.vue';
import { computed } from 'vue';
import type { Hand } from '../../domain/note';
import { useFrameValue } from '../browser/useFrameValue';
import { usePieceWay } from '../app/usePieceWay';
import { usePlaybackState } from '../app/usePlaybackState';
import { useDeps } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

/*
 * What is set once for a session of practice: which hands play, setting one's own fingers, the
 * metronome, the count-in before playing, and the pedals (off, to hear whether the fingers alone
 * play legato). In the transport bar where there is room for it; in a sheet of its own on a phone.
 */

/**
 * `tiled`: in a sheet, where they fill the width: the hands in one row, the rest in the next.
 * `fingers`: setting one's own fingers is offered (`setFingers` asks for it to begin).
 */
defineProps<{ tiled?: boolean; fingers?: boolean }>();
const emit = defineEmits<{ setFingers: [] }>();

/** How long the metronome's icon stays lit after a click, in seconds. */
const PULSE_SECONDS = 0.1;

const { playback, way } = useDeps();
/** The hands are a tool of learning: listened to, the piece is played with both. */
const usedWay = usePieceWay(way);
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
    <ToggleChip v-for="{ hand, label } in usedWay === 'learn' ? hands : []" :key="hand" class="item hand" :pressed="state.hands[hand]" @update:pressed="playback.setHandEnabled(hand, $event)">
      <template #sign><span class="dot" :class="[hand, { on: state.hands[hand] }]" aria-hidden="true" /></template>
      {{ t(label) }}
    </ToggleChip>

    <!-- (Not a switch: it begins setting them, in the bar of fingers. Not quiet: a bar's controls all show their edges.) -->
    <AppButton v-if="fingers" class="item" pill icon="pencil" @click="emit('setFingers')">{{ t('fingers') }}</AppButton>

    <ToggleChip class="item" :pressed="state.metronome" :title="t('metronomeHint')" @update:pressed="playback.setMetronomeEnabled($event)">
      <!-- (Its own sign, to flash with each click it plays.) -->
      <template #sign><span class="beat" :class="`pulse-${pulse}`"><AppIcon name="metronome" small /></span></template>
      {{ t('metronome') }}
    </ToggleChip>

    <ToggleChip v-for="item in switches" :key="item.label" class="item" :pressed="item.on" @update:pressed="item.set($event)">
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
.tiled .item {
  flex: 1 1 auto;
}

.tiled .hand {
  flex-basis: 40%;
}

/* The hand's colour in a chip: a small round of it, the size of a capital of the chip's words, by eye. */
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid currentColor;
}

.dot.right {
  color: var(--right);
}

.dot.left {
  color: var(--left);
}

.dot.on {
  background: currentColor;
}

/* The metronome's sign, quiet, and lit with each click (the count-in's too). */
.beat {
  display: inline-flex;
  color: var(--muted);
}

.beat.pulse-beat,
.beat.pulse-accent {
  color: var(--accent);
}
</style>
