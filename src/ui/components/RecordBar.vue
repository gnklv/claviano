<script setup lang="ts">
import AppButton from './AppButton.vue';
import ToggleChip from './ToggleChip.vue';
import TempoMark from './TempoMark.vue';
import { computed, ref } from 'vue';
import { METERS, RECORDING_TEMPO, type Meter } from '../../application/use-cases/Recorder';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useRecorder } from '../composables/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from './SegmentedControl.vue';

/*
 * Recording what is played: the button that begins and ends it, and the beat it is played to (the
 * metronome, its tempo, the time signature), set before recording and held through it.
 */
const { recorder, keepTake } = useDeps();
const { t, locale } = useI18n();
const state = useRecorder(recorder);

const busy = computed(() => state.value.state === 'armed' || state.value.state === 'recording');
const meter = computed<Meter>({ get: () => state.value.meter, set: (value) => recorder.setMeter(value) });
const meters = (Object.keys(METERS) as Meter[]).map((value) => ({ value, label: value }));

/** The bar the take is in, counted as it goes. */
const bar = ref<number | null>(null);
useAnimationFrame(() => {
  const now = recorder.bar;
  if (now !== bar.value) bar.value = now;
});

/** A take is kept under the day and the hour it was played: a name to tell it by, until it is given one. */
function keep(): void {
  const now = new Date();
  const when = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(now);
  const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes()].map((part) => String(part).padStart(2, '0')).join('-');
  void keepTake(t('takeTitle', { when }), `claviano-${stamp}`);
}

/** What is going on, in a few words. */
const status = computed(() => {
  switch (state.value.state) {
    case 'armed':
      return t('recordWaiting');
    case 'recording':
      return bar.value === null ? t('recording') : t('recordingBar', { bar: bar.value });
    case 'recorded':
      return t('recordedNotes', { count: state.value.notes });
    default:
      return '';
  }
});
</script>

<template>
  <div class="record-bar">
    <div class="take">
      <AppButton v-if="busy" class="stop" icon="stop" @click="recorder.stop()">{{ t('recordStop') }}</AppButton>
      <AppButton v-else-if="state.state === 'idle'" class="record" icon="record" @click="recorder.arm()">{{ t('record') }}</AppButton>
      <!-- A take is there: to hear, to keep, to mend at its end, or to play again. -->
      <template v-else>
        <AppButton :icon="state.listening ? 'stop' : 'play'" @click="state.listening ? recorder.stopListening() : recorder.listen()">{{ t(state.listening ? 'recordStop' : 'takeListen') }}</AppButton>
        <AppButton class="keep" variant="primary" @click="keep">{{ t('takeKeep') }}</AppButton>
      </template>
      <span class="status" :class="{ live: state.state === 'recording' }" role="status">{{ status }}</span>
    </div>

    <div v-if="state.state === 'recorded'" class="mend">
      <AppButton @click="recorder.eraseLastBar()">{{ t('takeEraseBar') }}</AppButton>
      <AppButton class="record" icon="record" @click="recorder.arm()">{{ t('recordAgain') }}</AppButton>
      <AppButton @click="recorder.discard()">{{ t('recordDiscard') }}</AppButton>
    </div>
    <!-- (The beat is set before a take; with one there, it is that take's.) -->
    <div v-else class="beat">
      <ToggleChip :pressed="state.metronome" :disabled="busy" @update:pressed="recorder.setMetronome($event)">{{ t('metronome') }}</ToggleChip>
      <div class="tempo" role="group" :aria-label="t('tempo')">
        <AppButton class="step" icon="minus" :disabled="busy || state.tempo <= RECORDING_TEMPO.min" :label="t('tempoSlower')" @click="recorder.setTempo(state.tempo - RECORDING_TEMPO.step)" />
        <output class="bpm"><TempoMark unit="quarter" :dotted="false" :per-minute="state.tempo" /></output>
        <AppButton class="step" icon="plus" :disabled="busy || state.tempo >= RECORDING_TEMPO.max" :label="t('tempoFaster')" @click="recorder.setTempo(state.tempo + RECORDING_TEMPO.step)" />
      </div>
      <SegmentedControl v-model="meter" class="meter" :class="{ held: busy }" :options="meters" :label="t('timeSignature')" />
    </div>
  </div>
</template>

<style scoped>
.record-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
  padding: 8px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.take,
.mend,
.beat,
.tempo {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.beat,
.mend {
  flex-wrap: wrap;
}

.keep {
  min-width: 0;
  white-space: nowrap;
}

.record,
.stop {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

/* (Recording is red, and so is what stops it.) */
.record :deep(.icon),
.stop :deep(.icon) {
  color: var(--record);
}

.status {
  overflow: hidden;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status.live {
  color: var(--record);
}

.step {
  min-width: 32px;
  padding-inline: 8px;
  line-height: 1;
}

.bpm {
  min-width: 4.5em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.record-bar .button {
  flex: none;
  white-space: nowrap;
}

/* A phone: the buttons in rows of their own, what is going on said under them. */
@media (max-width: 599px) {
  .take {
    flex-wrap: wrap;
  }

  .status {
    flex: 1 1 100%;
  }

  .mend .button {
    padding-inline: 10px;
  }
}

/* (Held through a take: not to be changed under it.) */
.meter.held {
  opacity: 0.4;
  pointer-events: none;
}
</style>
