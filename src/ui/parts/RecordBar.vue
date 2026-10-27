<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import MenuList from '../components/MenuList.vue';
import PopOver from '../components/PopOver.vue';
import ToggleChip from '../components/ToggleChip.vue';
import TempoMark from '../components/TempoMark.vue';
import { computed, ref } from 'vue';
import { METERS, RECORDING_TEMPO, type Meter } from '../../application/use-cases/Recorder';
import { useFrameValue } from '../browser/useFrameValue';
import { NARROW_SCREEN, SHORT_SCREEN, useMediaQuery } from '../browser/useMediaQuery';
import { useRecorder } from '../app/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SegmentedControl from '../components/SegmentedControl.vue';

/*
 * Recording what is played: the button that begins and ends it, and the beat it is played to (the
 * metronome, its tempo, the time signature), set before recording and held through it.
 *
 * A phone held upright has the room of one row for a take, the keyboard's and the staff's being
 * the rest: while it is played, "Stop" and what is going on, the beat said in words (it cannot be
 * changed then, and its rows would only take the room); once there, hearing it, keeping it, and
 * what else can be done with it behind "⋯".
 */
const { recorder, keepTake } = useDeps();
const { t, locale } = useI18n();
/** A phone on its side: the bar has one row, and no room for every word. */
const low = useMediaQuery(SHORT_SCREEN);
/** A phone held upright. */
const narrow = useMediaQuery(NARROW_SCREEN);
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

// --- On a phone, what else can be done with a take: behind "⋯". ---

const menu = ref(false);
const mends = computed(() => [
  { id: 'erase-bar', label: t('takeEraseBar') },
  { id: 'again', label: t('recordAgain') },
  { id: 'discard', label: t('recordDiscard'), danger: true },
]);
function mend(action: string): void {
  menu.value = false;
  if (action === 'erase-bar') recorder.eraseLastBar();
  else if (action === 'again') void recorder.arm();
  else recorder.discard();
}

/** What is going on, in a few words. */
const status = computed(() => {
  switch (state.value.state) {
    case 'armed':
      // (On a phone, in the room beside "Stop", with the beat after it: a few words.)
      return t(narrow.value ? 'recordWaitingShort' : 'recordWaiting');
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
      <AppButton v-else-if="state.state === 'idle'" class="act wide" recording icon="record" @click="recorder.arm()">{{ t('record') }}</AppButton>
      <!-- A take is there: to hear, to keep, to mend at its end, or to play again. -->
      <template v-else>
        <!-- (On a phone the take is one row: what an icon says by itself goes without its word, and the main action keeps all of its.) -->
        <AppButton v-if="low || narrow" class="act" :icon="state.listening ? 'stop' : 'play'" :label="t(state.listening ? 'recordStop' : 'takeListen')" @click="state.listening ? recorder.stopListening() : recorder.listen()" />
        <AppButton v-else class="act wide" :icon="state.listening ? 'stop' : 'play'" @click="state.listening ? recorder.stopListening() : recorder.listen()">{{ t(state.listening ? 'recordStop' : 'takeListen') }}</AppButton>
        <AppButton class="act wide keep" variant="primary" @click="keep">{{ t('takeKeep') }}</AppButton>
        <PopOver v-if="narrow" v-model:open="menu" class="act" place="above-end" role="menu" :label="t('takeActions')">
          <AppButton icon="more" :label="t('takeActions')" :aria-expanded="menu" @click="menu = !menu" />
          <template #panel><MenuList :items="mends" @choose="mend" /></template>
        </PopOver>
      </template>
      <!-- (On a phone the take's notes are seen on the staff: their count is only read out.) -->
      <!-- (On a phone the beat stands after it, and stays whole: the words give way first.) -->
      <span class="status" :class="{ live: state.state === 'recording', unseen: narrow && state.state === 'recorded', blank: status === '' }" role="status"
        ><span class="said">{{ status }}</span
        ><span v-if="narrow && busy" class="beat-said">&nbsp;· <TempoMark unit="quarter" :dotted="false" :per-minute="state.tempo" /> · {{ state.meter }}</span></span
      >
    </div>

    <div v-if="state.state === 'recorded' && !narrow" class="mend">
      <AppButton class="act" @click="recorder.eraseLastBar()">{{ t('takeEraseBar') }}</AppButton>
      <AppButton class="act" recording icon="record" @click="recorder.arm()">{{ t('recordAgain') }}</AppButton>
      <AppButton v-if="low" class="act" icon="close" :label="t('recordDiscard')" @click="recorder.discard()" />
      <AppButton v-else class="act" @click="recorder.discard()">{{ t('recordDiscard') }}</AppButton>
    </div>
    <!-- (The beat is set before a take; with one there, it is that take's.) -->
    <div v-else-if="state.state !== 'recorded' && !(narrow && busy)" class="beat">
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
  border-top: var(--edge) solid var(--border);
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
  display: flex;
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.said {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.beat-said {
  flex: none;
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
 * A phone: rows as wide as the screen, each filled from edge to edge. A take one row: "Record" or
 * "Stop" and what is going on beside it; once there, what is done with it, the buttons sharing the
 * width. Before a take, the beat under it: the metronome and the tempo at the two ends of a row,
 * the time signature across the next.
 */
@media (max-width: 599px) {
  .record-bar {
    display: grid;
    /* (One column as wide as the screen, whatever is in it.) */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  /* (Beginning, hearing and keeping share the row; "Stop" and "⋯" are as wide as their words.) */
  .take .wide {
    flex: 1 1 auto;
  }

  /* (What is going on gives way first, cut short: "Stop" beside it never is.) */
  .take .status {
    flex: 1 1 0;
  }

  .status.blank {
    display: none;
  }

  /* (Read out, not shown: the notes are seen on the staff. See .unseen: what is said of the status's size here gives way to it.) */
  .status.unseen {
    flex: none;
    width: auto;
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
