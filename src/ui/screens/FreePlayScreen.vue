<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
import { computed, onMounted, onUnmounted } from 'vue';
import PianoKeys from '../components/PianoKeys.vue';
import PlayedRoll from '../components/PlayedRoll.vue';
import RecordBar from '../components/RecordBar.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import TakeStaff from '../components/TakeStaff.vue';
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
  <div class="free-play">
    <header class="bar">
      <button class="button back" :title="t('backToLibrary')" :aria-label="t('backToLibrary')" @click="emit('back')"><AppIcon name="back" /></button>
      <span class="title">{{ t('freePlay') }}</span>
      <div class="octaves" role="group" :aria-label="t('octave')">
        <button class="button" :disabled="!state.canGoLower" :title="`${t('octaveLower')} (Z)`" :aria-label="t('octaveLower')" @click="freePlay.shift(-1)"><AppIcon name="lower" /></button>
        <button class="button" :disabled="!state.canGoHigher" :title="`${t('octaveHigher')} (X)`" :aria-label="t('octaveHigher')" @click="freePlay.shift(1)"><AppIcon name="higher" /></button>
      </div>
      <SettingsPanel />
    </header>

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

.bar {
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--border);
}

.back {
  flex: none;
  min-width: 40px;
  padding-inline: 10px;
}

.title {
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.octaves {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.octaves .button {
  min-width: 36px;
  padding-inline: 8px;
}

.stage {
  position: relative;
  display: grid;
  min-height: 0;
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}

/* The hint stands over the tiles, at the top: out of their way as they rise. */
.stage > * {
  grid-area: 1 / 1;
}

/* With a take, its notes have the upper part of the stage, the tiles the rest. */
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
  right: 12px;
  bottom: 6px;
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
  padding: 16px;
  pointer-events: none;
  color: var(--muted);
  text-align: center;
  text-wrap: balance;
}

/* The keyboard: a good part of the screen, as tall as keys are comfortable, clear of the home indicator and the notch. */
.keyboard {
  height: clamp(140px, 38vh, 260px);
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  border-top: 1px solid var(--border);
  background: var(--panel);
}

/* A phone on its side: the keys are what the screen is for. */
@media (max-height: 500px) {
  .bar {
    padding-block: max(4px, env(safe-area-inset-top)) 4px;
  }

  .keyboard {
    height: 62vh;
  }
}
</style>
