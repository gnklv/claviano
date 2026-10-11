<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue';
import { tempoMarkAt, writtenBeatAt } from '../../domain/score';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { SMALL_SCREEN, useMediaQuery } from '../composables/useMediaQuery';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import PopOver from './PopOver.vue';
import SheetDialog from './SheetDialog.vue';
import type { TempoReading } from '../tempoReading';
import TempoMark from './TempoMark.vue';
import TempoSettings from './TempoSettings.vue';

/*
 * The tempo in the transport bar: a button that says what it is (80%, and a quarter = 96), and behind it
 * the means of setting it: in a small panel over the button, or in a sheet on a phone.
 */

const { playback } = useDeps();
const { t } = useI18n();
const state = usePlaybackState(playback);
const percent = computed(() => Math.round(state.value.tempo * 100));
const phone = useMediaQuery(SMALL_SCREEN);

/** The tempo the music is played at now, the setting applied: 45 at 50% of a written 90. None without a tempo mark. */
const mark = ref<TempoReading | null>(null);

useAnimationFrame(() => {
  const score = playback.score;
  const written = score && tempoMarkAt(score, writtenBeatAt(score, playback.position));
  const now = written ? { unit: written.unit.value, dotted: written.unit.dots > 0, perMinute: Math.round(written.perMinute * playback.tempo) } : null;
  const shown = mark.value;
  if (now?.unit !== shown?.unit || now?.dotted !== shown?.dotted || now?.perMinute !== shown?.perMinute) mark.value = now;
});

// --- The means of setting it: a small panel over the button; on a phone, a sheet. ---

const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const open = ref(false);

function toggle(): void {
  if (phone.value) sheet.value?.open();
  else open.value = !open.value;
}

watch(phone, () => (open.value = false));
</script>

<template>
  <div class="tempo">
    <PopOver v-model:open="open" place="above" :label="t('tempo')">
      <button class="button current" :aria-label="`${t('tempo')}: ${percent}%`" :title="t('tempo')" :aria-expanded="phone ? undefined : open" @click="toggle">
        {{ percent }}%<span v-if="mark" class="mark"> · <TempoMark v-bind="mark" /></span>
      </button>
      <template #panel>
        <div class="settings"><TempoSettings :mark="mark" /></div>
      </template>
    </PopOver>
    <SheetDialog v-if="phone" ref="sheet" :title="t('tempo')">
      <TempoSettings :mark="mark" />
    </SheetDialog>
  </div>
</template>

<style scoped>
.current {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mark {
  color: var(--muted);
}

/* Where the bar is tight, the percent alone: what it makes is in the panel. */
@media (max-width: 699px) {
  .mark {
    display: none;
  }
}

.settings {
  box-sizing: border-box;
  width: 300px;
  padding: var(--space-4);
}
</style>
