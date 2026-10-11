<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { NoteValue } from '../../domain/notation/noteValue';
import { tempoMarkAt, writtenBeatAt } from '../../domain/score';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useMediaQuery } from '../composables/useMediaQuery';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import SheetDialog from './SheetDialog.vue';
import TempoSettings from './TempoSettings.vue';

/*
 * The tempo in the transport bar: a button that says what it is ("80% · ♩ = 96"), and behind it
 * the means of setting it: in a small panel over the button, or in a sheet on a phone.
 */

/** Notes for the tempo readout ("♩ = 90"), in the interface's own font. */
const NOTE_SIGNS: Record<NoteValue, string> = {
  whole: '𝅝',
  half: '𝅗𝅥',
  quarter: '♩',
  eighth: '♪',
  sixteenth: '𝅘𝅥𝅯',
  thirtySecond: '𝅘𝅥𝅰',
};

const { playback } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const percent = computed(() => Math.round(state.value.tempo * 100));
const phone = useMediaQuery('(max-width: 599px)');

/** The tempo the music is played at now, the setting applied: "♩ = 45" at 50% of ♩ = 90. Empty without a tempo mark. */
const mark = ref('');

useAnimationFrame(() => {
  const score = playback.score;
  const written = score && tempoMarkAt(score, writtenBeatAt(score, playback.position));
  const now = written ? `${NOTE_SIGNS[written.unit.value]}${written.unit.dots ? '.' : ''} = ${Math.round(written.perMinute * playback.tempo)}` : '';
  if (now !== mark.value) mark.value = now;
});

// --- The small panel: open until Esc or a press anywhere outside it. ---

const root = useTemplateRef<HTMLElement>('root');
const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const open = ref(false);

function toggle(): void {
  if (phone.value) sheet.value?.open();
  else open.value = !open.value;
}

function onPressOutside(event: Event): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

function listen(on: boolean): void {
  const change = on ? 'addEventListener' : 'removeEventListener';
  document[change]('pointerdown', onPressOutside);
  document[change]('keydown', onKeyDown as EventListener);
}

watch(open, listen);
watch(phone, () => (open.value = false));
onUnmounted(() => listen(false));
</script>

<template>
  <div ref="root" class="tempo">
    <button class="button current" :aria-label="`${t('tempo')}: ${percent}%`" :title="t('tempo')" :aria-expanded="phone ? undefined : open" @click="toggle">
      {{ percent }}%<span v-if="mark" class="mark"> · {{ mark }}</span>
    </button>
    <SheetDialog v-if="phone" ref="sheet" :title="t('tempo')">
      <TempoSettings :mark="mark" />
    </SheetDialog>
    <Transition v-else name="pop">
      <div v-if="open" class="popover" role="group" :aria-label="t('tempo')">
        <TempoSettings :mark="mark" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tempo {
  position: relative;
}

.current {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mark {
  color: var(--muted);
}

/* Phones: finger-sized. */
@media (max-width: 599px) {
  .current {
    min-height: 44px;
  }
}

/* Where the bar is tight, the percent alone: what it makes is in the panel. */
@media (max-width: 699px) {
  .mark {
    display: none;
  }
}

.popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  z-index: 10;
  box-sizing: border-box;
  width: 300px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 10px 32px rgb(0 0 0 / 0.25);
  translate: -50% 0;
  transform-origin: bottom center;
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.15s ease-out,
    scale 0.15s ease-out;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  scale: 0.96;
}

@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition: none;
  }
}
</style>
