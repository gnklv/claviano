<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import ToggleChip from '../components/ToggleChip.vue';
import TempoMark from '../components/TempoMark.vue';
import { computed } from 'vue';
import { METERS, RECORDING_TEMPO, type Meter } from '../../application/use-cases/Recorder';
import { useFrameValue } from '../browser/useFrameValue';
import { SHORT_SCREEN, useMediaQuery } from '../browser/useMediaQuery';
import { useRecorder } from '../app/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from '../components/SegmentedControl.vue';

/*
 * Recording what is played: the button that begins and ends it, and the beat it is played to (the
 * metronome, its tempo, the time signature), set before recording and held through it.
 */
const { recorder, keepTake } = useDeps();
const { t, locale } = useI18n();
/** A phone on its side: the bar has one row, and no room for every word. */
const low = useMediaQuery(SHORT_SCREEN);
const state = useRecorder(recorder);

const busy = computed(() => state.value.state === 'armed' || state.value.state === 'recording');
const meter = computed<Meter>({ get: () => state.value.meter, set: (value) => recorder.setMeter(value) });
const meters = (Object.keys(METERS) as Meter[]).map((value) => ({ value, label: value }));

/** The bar the take is in, counted as it goes. */
const bar = useFrameValue(() => recorder.bar);

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
      <AppButton v-if="busy" class="act" recording icon="stop" @click="recorder.stop()">{{ t('recordStop') }}</AppButton>
      <AppButton v-else-if="state.state === 'idle'" class="act" recording icon="record" @click="recorder.arm()">{{ t('record') }}</AppButton>
      <!-- A take is there: to hear, to keep, to mend at its end, or to play again. -->
      <template v-else>
        <!-- (On a phone on its side the bar is one row: what an icon says by itself goes without its word.) -->
        <AppButton v-if="low" class="act" :icon="state.listening ? 'stop' : 'play'" :label="t(state.listening ? 'recordStop' : 'takeListen')" @click="state.listening ? recorder.stopListening() : recorder.listen()" />
        <AppButton v-else class="act" :icon="state.listening ? 'stop' : 'play'" @click="state.listening ? recorder.stopListening() : recorder.listen()">{{ t(state.listening ? 'recordStop' : 'takeListen') }}</AppButton>
        <AppButton class="act keep" variant="primary" @click="keep">{{ t('takeKeep') }}</AppButton>
      </template>
      <span class="status" :class="{ live: state.state === 'recording' }" role="status">{{ status }}</span>
    </div>

    <div v-if="state.state === 'recorded'" class="mend">
      <AppButton class="act" @click="recorder.eraseLastBar()">{{ t('takeEraseBar') }}</AppButton>
      <AppButton class="act" recording icon="record" @click="recorder.arm()">{{ t('recordAgain') }}</AppButton>
      <AppButton v-if="low" class="act" icon="close" :label="t('recordDiscard')" @click="recorder.discard()" />
      <AppButton v-else class="act" @click="recorder.discard()">{{ t('recordDiscard') }}</AppButton>
    </div>
    <!-- (The beat is set before a take; with one there, it is that take's.) -->
    <div v-else class="beat">
      <ToggleChip :pressed="state.metronome" :disabled="busy" @update:pressed="recorder.setMetronome($event)">{{ t('metronome') }}</ToggleChip>
      <div class="tempo" role="group" :aria-label="t('tempo')">
        <AppButton class="act" icon="minus" :disabled="busy || state.tempo <= RECORDING_TEMPO.min" :label="t('tempoSlower')" @click="recorder.setTempo(state.tempo - RECORDING_TEMPO.step)" />
        <output class="bpm"><TempoMark unit="quarter" :dotted="false" :per-minute="state.tempo" /></output>
        <AppButton class="act" icon="plus" :disabled="busy || state.tempo >= RECORDING_TEMPO.max" :label="t('tempoFaster')" @click="recorder.setTempo(state.tempo + RECORDING_TEMPO.step)" />
      </div>
      <SegmentedControl v-model="meter" class="meter" wide :disabled="busy" :options="meters" :label="t('timeSignature')" />
    </div>
  </div>
</template>

<style scoped>
.record-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-5);
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) var(--space-2) max(var(--space-4), env(safe-area-inset-left));
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.take,
.mend,
.beat,
.tempo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.beat,
.mend {
  flex-wrap: wrap;
}

.keep {
  min-width: 0;
}

/* What is done with a take has what room the beat leaves it; the word on what is going on gives way first, and never pushes the beat to a row of its own. */
.take {
  flex: 1 1 auto;
}

.status {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status.live {
  color: var(--record);
}

.bpm {
  min-width: 4.5em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.act {
  flex: none;
}

/*
 * A phone: rows as wide as the screen, each filled from edge to edge. What is done with a take on
 * top, its buttons sharing the width; what is going on said under them; then the beat: the metronome
 * and the tempo at the two ends of a row, the time signature across the next.
 */
@media (max-width: 599px) {
  .record-bar {
    display: grid;
    /* (One column as wide as the screen, whatever is in it.) */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .take,
  .mend {
    flex-wrap: wrap;
  }

  .take .act,
  .mend .act {
    flex: 1 1 auto;
  }

  .status {
    flex: 1 1 100%;
    width: auto;
    text-align: center;
  }

  .status:empty {
    display: none;
  }

  .beat {
    display: grid;
    grid-template-columns: auto 1fr;
  }

  .tempo {
    justify-self: end;
  }

  .meter {
    grid-column: 1 / -1;
  }
}

/*
 * A phone on its side: one row, always. A take's five buttons fit it closer together, and without
 * the count of its notes (which the notes over the bar show).
 */
@media (max-height: 500px) {
  .record-bar {
    column-gap: var(--space-3);
  }

  .keep ~ .status {
    display: none;
  }
}
</style>
