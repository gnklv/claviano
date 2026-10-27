<script setup lang="ts">
import ScreenHeader from '../components/ScreenHeader.vue';
import { computed, onMounted, onUnmounted } from 'vue';
import PianoKeys from '../components/PianoKeys.vue';
import PlayedRoll from '../parts/PlayedRoll.vue';
import RecordBar from '../parts/RecordBar.vue';
import SettingsPanel from '../parts/SettingsPanel.vue';
import TakeStaff from '../parts/TakeStaff.vue';
import { useFreePlay } from '../app/useFreePlay';
import { useRecorder } from '../app/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * Free play: the keyboard leads. What is played rises from the keys as it sounds, and can be
 * recorded: a take is written down as notes while it is played, on a staff that is there before it
 * (empty, in the metre set), so that nothing moves when recording begins.
 */

const emit = defineEmits<{ back: [] }>();

const { freePlay, recorder } = useDeps();
const { t } = useI18n();
const state = useFreePlay(freePlay);
const recording = useRecorder(recorder);
/** There is a take, being recorded or recorded: it is shown as notes. */
const taken = computed(() => recording.value.state === 'recording' || recording.value.state === 'recorded');
/** Nothing asked of recording yet: what "Record" does is said. (Waiting for the first note, the record bar says what to do.) */
const unasked = computed(() => recording.value.state === 'idle');

/** Black keys and all: twelve to every seven white ones, ending on a white one. */
const keysFor = (whiteKeys: number): number => {
  const octaves = Math.floor(whiteKeys / 7);
  const rest = whiteKeys % 7;
  // (From a Do: the white keys of an octave stand at these semitones.)
  return octaves * 12 + ([0, 1, 3, 5, 6, 8, 10][rest] ?? 0);
};
/**
 * From an octave and a key to three octaves and a key: a phone held upright has room for eight white
 * keys a fingertip wide (34 px) beside the octave arrows; never narrower, for fewer keys than that
 * would not hold a phrase.
 */
const fit = (whiteKeys: number) => freePlay.setKeys(keysFor(Math.min(22, Math.max(8, whiteKeys))));

onMounted(() => freePlay.enter());
onUnmounted(() => {
  // (A take being recorded ends with the visit; what is recorded stays for coming back to.)
  recorder.stop();
  freePlay.leave();
});
</script>

<template>
  <!-- (Safari's own pinch, which begins with a finger on the keys and another beside them: this screen is played on, not zoomed.) -->
  <div class="free-play" @gesturestart.prevent>
    <ScreenHeader back @back="emit('back')">
      <template #title>{{ t('freePlay') }}</template>
      <SettingsPanel />
    </ScreenHeader>

    <main class="stage" :class="{ taken }">
      <div class="written">
        <TakeStaff />
        <!-- What the staff is for, until there is a take on it. -->
        <p v-if="unasked" class="on-staff">{{ t('freePlayHintRecord') }}</p>
        <!-- Without the metronome nobody knows where the beats were: the bars are a guess. -->
        <p v-else-if="taken && !recording.metronome" class="caveat">{{ t('recordedOffTheBeat') }}</p>
      </div>
      <PlayedRoll class="played" :lowest="state.lowest" :keys="state.keys" />
      <p v-if="!taken" class="hint">
        <!-- (On a phone the staff is too low to say it on: it is said here first.) -->
        <span v-if="unasked" class="record-word">{{ t('freePlayHintRecordAbove') }}</span>
        {{ t('freePlayHint') }}
        <!-- (The computer's keyboard: nothing to say where there is only a finger.) -->
        <span class="by-letters">{{ t('freePlayHintLetters') }}</span>
      </p>
    </main>

    <RecordBar />

    <footer class="keyboard">
      <PianoKeys
        :lowest="state.lowest"
        :keys="state.keys"
        :pressed="state.pressed"
        @press="freePlay.press($event)"
        @release="freePlay.release($event)"
        :octaves="{ lower: state.canGoLower, higher: state.canGoHigher }"
        @shift="freePlay.shift($event)"
        @room="fit"
      />
    </footer>
  </div>
</template>

<style scoped>
.free-play {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
}

.stage {
  position: relative;
  display: grid;
  min-height: 0;
  /* Whatever is drawn here, it never lies over the header or the record bar. */
  overflow: hidden;
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}

/*
 * The staff has the upper part of the stage (never too low to hold both staves), before a take and
 * with one; the tiles the rest, the hint on playing standing over them, at their top, out of their
 * way as they rise.
 */
.stage {
  grid-template-rows: minmax(150px, 45%) 1fr;
}

.written {
  grid-area: 1 / 1;
}

.played,
.hint {
  grid-area: 2 / 1;
}

.written {
  position: relative;
  min-height: 0;
  border-bottom: var(--edge) solid var(--border);
  background: var(--surface);
}

/* Under the lower staff, in the room the staff keeps there. */
.on-staff {
  position: absolute;
  inset: auto 0 var(--space-3);
  margin: 0;
  padding-inline: var(--space-4);
  color: var(--muted);
  text-align: center;
  text-wrap: balance;
  pointer-events: none;
}

/* What the staff is for is said on it; on a phone, whose staff is too low for words under it, over the tiles first. */
.record-word {
  display: none;
}

@media (max-width: 599px) {
  .on-staff {
    display: none;
  }

  .record-word {
    display: block;
    margin-bottom: var(--space-2);
  }
}

.caveat {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-1);
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  pointer-events: none;
}

@media (pointer: coarse) {
  .by-letters {
    display: none;
  }
}

.hint {
  align-self: start;
  justify-self: center;
  max-width: 36em;
  margin: 0;
  padding: var(--space-4);
  pointer-events: none;
  color: var(--muted);
  text-align: center;
  text-wrap: balance;
}

/*
 * The keyboard, clear of the home indicator and the notch. Its height is an instrument's, not the
 * interface's: tall enough for a finger to land on a black key and on the white under it, and no
 * taller, for what is played is seen over it. (Tuned by eye on a phone held upright, and on its side.)
 */
.keyboard {
  /* (Of the height there is now, with the browser's bars out: dvh, not vh.) */
  height: clamp(var(--keys-least), 22dvh, var(--keys-most));
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  border-top: var(--edge) solid var(--border);
  background: var(--panel);
}

/* A phone on its side: the keys a little under half of what height there is (the header is thin by itself). */
@media (max-height: 500px) {
  .keyboard {
    height: 45dvh;
  }

  .hint {
    padding-block: var(--space-2);
  }

  /*
   * No room for the notes and the tiles both. Before a take, the tiles have it (the staff would be
   * empty); with one, the notes (they say what was played, and more).
   */
  .stage {
    grid-template-rows: minmax(0, 1fr);
  }

  .stage:not(.taken) .written,
  .stage.taken .played,
  .stage.taken .hint {
    display: none;
  }

  .played,
  .hint {
    grid-area: 1 / 1;
  }
}

/*
 * Lower still (a phone on its side inside a browser, whose bars take a third of the height): the
 * stage cannot hold two staves. The tiles have it, which can be read at any height; the notes are
 * there again where there is room (upright, or with the app installed).
 */
@media (max-height: 339px) {
  .stage.taken .written {
    display: none;
  }

  .stage.taken .played {
    display: block;
  }
}
</style>
