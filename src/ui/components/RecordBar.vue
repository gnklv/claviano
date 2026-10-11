<script setup lang="ts">
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
      <button v-if="busy" class="button stop" @click="recorder.stop()"><span class="sign square" aria-hidden="true" />{{ t('recordStop') }}</button>
      <button v-else-if="state.state === 'idle'" class="button record" @click="recorder.arm()"><span class="sign dot" aria-hidden="true" />{{ t('record') }}</button>
      <!-- A take is there: to hear, to keep, to mend at its end, or to play again. -->
      <template v-else>
        <button class="button" @click="state.listening ? recorder.stopListening() : recorder.listen()">{{ state.listening ? `■ ${t('recordStop')}` : `▶ ${t('takeListen')}` }}</button>
        <button class="button primary keep" @click="keep">{{ t('takeKeep') }}</button>
      </template>
      <span class="status" :class="{ live: state.state === 'recording' }" role="status">{{ status }}</span>
    </div>

    <div v-if="state.state === 'recorded'" class="mend">
      <button class="button" @click="recorder.eraseLastBar()">{{ t('takeEraseBar') }}</button>
      <button class="button record" @click="recorder.arm()"><span class="sign dot" aria-hidden="true" />{{ t('recordAgain') }}</button>
      <button class="button" @click="recorder.discard()">{{ t('recordDiscard') }}</button>
    </div>
    <!-- (The beat is set before a take; with one there, it is that take's.) -->
    <div v-else class="beat">
      <button class="toggle" :aria-pressed="state.metronome" :disabled="busy" @click="recorder.setMetronome(!state.metronome)">
        {{ t('metronome') }}
      </button>
      <div class="tempo" role="group" :aria-label="t('tempo')">
        <button class="button step" :disabled="busy || state.tempo <= RECORDING_TEMPO.min" :aria-label="t('tempoSlower')" @click="recorder.setTempo(state.tempo - RECORDING_TEMPO.step)">−</button>
        <output class="bpm">♩ = {{ state.tempo }}</output>
        <button class="button step" :disabled="busy || state.tempo >= RECORDING_TEMPO.max" :aria-label="t('tempoFaster')" @click="recorder.setTempo(state.tempo + RECORDING_TEMPO.step)">+</button>
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

.sign {
  flex: none;
  width: 10px;
  height: 10px;
  background: var(--record);
}

.dot {
  border-radius: 50%;
}

.square {
  border-radius: calc(var(--radius-s) / 3);
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
