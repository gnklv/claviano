<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import PianoKeys from '../components/PianoKeys.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import { useFreePlay } from '../composables/useFreePlay';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/* Free play: the keyboard leads. (What is played will be written down here, as notes, and kept as a piece.) */

const emit = defineEmits<{ back: [] }>();

const { freePlay } = useDeps();
const { t } = useI18n();
const state = useFreePlay(freePlay);

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
onUnmounted(() => freePlay.leave());
</script>

<template>
  <div class="free-play">
    <header class="bar">
      <button class="button back" :title="t('backToLibrary')" :aria-label="t('backToLibrary')" @click="emit('back')">←</button>
      <span class="title">{{ t('freePlay') }}</span>
      <div class="octaves" role="group" :aria-label="t('octave')">
        <button class="button" :disabled="!state.canGoLower" :title="`${t('octaveLower')} (Z)`" :aria-label="t('octaveLower')" @click="freePlay.shift(-1)">‹</button>
        <button class="button" :disabled="!state.canGoHigher" :title="`${t('octaveHigher')} (X)`" :aria-label="t('octaveHigher')" @click="freePlay.shift(1)">›</button>
      </div>
      <SettingsPanel />
    </header>

    <main class="stage">
      <p class="hint">
        {{ t('freePlayHint') }}
        <!-- (The computer's keyboard: nothing to say where there is only a finger.) -->
        <span class="by-letters">{{ t('freePlayHintLetters') }}</span>
      </p>
    </main>

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
  grid-template-rows: auto 1fr auto;
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
  font-size: 16px;
  line-height: 1;
}

.title {
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
  font-size: 16px;
  line-height: 1;
}

.stage {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 16px;
}

@media (pointer: coarse) {
  .by-letters {
    display: none;
  }
}

.hint {
  max-width: 36em;
  margin: 0;
  color: var(--muted);
  text-align: center;
  text-wrap: balance;
}

/* The keyboard: a good part of the screen, as tall as keys are comfortable, clear of the home indicator and the notch. */
.keyboard {
  height: clamp(140px, 38vh, 260px);
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  border-top: 2px solid var(--border);
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
