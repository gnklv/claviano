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
const { recorder } = useDeps();
const { t } = useI18n();
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
      <button v-else class="button record" @click="recorder.arm()">
        <span class="sign dot" aria-hidden="true" />{{ t(state.state === 'recorded' ? 'recordAgain' : 'record') }}
      </button>
      <button v-if="state.state === 'recorded'" class="button" @click="recorder.discard()">{{ t('recordDiscard') }}</button>
      <span class="status" :class="{ live: state.state === 'recording' }" role="status">{{ status }}</span>
    </div>

    <div class="beat">
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
.beat,
.tempo {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.beat {
  flex-wrap: wrap;
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
  background: var(--record, #d9352b);
}

.dot {
  border-radius: 50%;
}

.square {
  border-radius: 2px;
}

.status {
  overflow: hidden;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status.live {
  color: var(--record, #d9352b);
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

/* (Held through a take: not to be changed under it.) */
.meter.held {
  opacity: 0.4;
  pointer-events: none;
}
</style>
