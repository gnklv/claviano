<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import { computed, onMounted, onUnmounted } from 'vue';
import PianoKeys from '../components/PianoKeys.vue';
import PlayedRoll from '../parts/PlayedRoll.vue';
import RecordBar from '../parts/RecordBar.vue';
import SettingsPanel from '../parts/SettingsPanel.vue';
import TakeStaff from '../parts/TakeStaff.vue';
import { useFreePlay } from '../composables/useFreePlay';
import { useRecorder } from '../composables/useRecorder';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * Free play: the keyboard leads. What is played rises from the keys as it sounds, and can be
 * recorded: a take is written down as notes while it is played. (It will be kept as a piece.)
 */

const emit = defineEmits<{ back: [] }>();

const { freePlay, recorder } = useDeps();
const { t } = useI18n();
const state = useFreePlay(freePlay);
const recording = useRecorder(recorder);
/** There is a take, being recorded or recorded: it is shown as notes. */
const taken = computed(() => recording.value.state === 'recording' || recording.value.state === 'recorded');

/** Black keys and all: twelve to every seven white ones, ending on a white one. */
const keysFor = (whiteKeys: number): number => {
  const octaves = Math.floor(whiteKeys / 7);
  const rest = whiteKeys % 7;
  // (From a Do: the white keys of an octave stand at these semitones.)
  return octaves * 12 + ([0, 1, 3, 5, 6, 8, 10][rest] ?? 0);
};
/** From an octave and a half (a phone held upright) to three octaves and a key. */
const fit = (whiteKeys: number) => freePlay.setKeys(keysFor(Math.min(22, Math.max(10, whiteKeys))));

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
    <ScreenHeader class="bar" back @back="emit('back')">
      <template #title>{{ t('freePlay') }}</template>
      <div class="octaves" role="group" :aria-label="t('octave')">
        <AppButton icon="lower" :disabled="!state.canGoLower" :label="t('octaveLower')" :hint="`${t('octaveLower')} (Z)`" @click="freePlay.shift(-1)" />
        <AppButton icon="higher" :disabled="!state.canGoHigher" :label="t('octaveHigher')" :hint="`${t('octaveHigher')} (X)`" @click="freePlay.shift(1)" />
      </div>
      <SettingsPanel />
    </ScreenHeader>

    <main class="stage" :class="{ taken }">
      <div v-if="taken" class="written">
        <TakeStaff />
        <!-- Without the metronome nobody knows where the beats were: the bars are a guess. -->
        <p v-if="!recording.metronome" class="caveat">{{ t('recordedOffTheBeat') }}</p>
      </div>
      <PlayedRoll class="played" :lowest="state.lowest" :keys="state.keys" />
      <p v-if="!taken" class="hint">
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

.octaves {
  display: inline-flex;
  flex: none;
  gap: var(--space-1);
}

.stage {
  position: relative;
  display: grid;
  min-height: 0;
  /* Whatever is drawn here, it never lies over the header or the record bar. */
  overflow: hidden;
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}

/* The hint stands over the tiles, at the top: out of their way as they rise. */
.stage > * {
  grid-area: 1 / 1;
}

/* With a take, its notes have the upper part of the stage (never too low to hold both staves), the tiles the rest. */
.stage.taken {
  grid-template-rows: minmax(150px, 45%) 1fr;
}

.written {
  position: relative;
  min-height: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.stage.taken .played {
  grid-area: 2 / 1;
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
  height: clamp(120px, 22dvh, 200px);
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  border-top: 1px solid var(--border);
  background: var(--panel);
}

/* A phone on its side: a thin header, and the keys a little under half of what height there is. */
@media (max-height: 500px) {
  .bar {
    padding-block: max(var(--space-1), env(safe-area-inset-top)) var(--space-1);
  }

  .keyboard {
    height: 45dvh;
  }

  .hint {
    padding-block: var(--space-2);
  }

  /* No room for a take's notes and the tiles both: the notes have it all (they say what was played, and more). */
  .stage.taken {
    grid-template-rows: minmax(0, 1fr);
  }

  .stage.taken .played {
    display: none;
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
    grid-area: 1 / 1;
  }
}
</style>
