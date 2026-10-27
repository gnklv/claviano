<script setup lang="ts">
import { computed } from 'vue';
import type { Finger } from '../../domain/fingering/hand';
import { fingeringAt, type NoteOnPage } from '../../domain/fingering/own';
import type { Score } from '../../domain/score';
import { useI18n } from '../i18n/useI18n';
import AppButton from './AppButton.vue';
import AppNotice from './AppNotice.vue';
import ToggleChip from './ToggleChip.vue';

/*
 * Setting one's own fingers, in place of the transport while it is done: the note picked (on the
 * staff or among the falling notes), a finger for it, or none. Each note is picked by hand: a step on
 * by itself to the next note of the hand was tried, and was more in the way than a help.
 */
const props = defineProps<{ page: Score | null; picked: NoteOnPage | null }>();
/** `set`: a finger for the note picked, or null for none of one's own. */
const emit = defineEmits<{ set: [finger: Finger | null]; done: [] }>();

const { t, noteLabel } = useI18n();
const FINGERS: Finger[] = [1, 2, 3, 4, 5];

/** The finger at the note picked: one's own, or one the notes give (a hint is not one). */
const now = computed(() => {
  const at = props.page && props.picked ? fingeringAt(props.page, props.picked) : null;
  return at && !at.hint ? { finger: Number(at.text), own: at.own === true } : null;
});
</script>

<template>
  <div class="finger-bar">
    <template v-if="picked">
      <span class="note">{{ noteLabel(picked.pitch) }} · {{ t(picked.hand === 'right' ? 'rightHand' : 'leftHand') }}</span>
      <div class="fingers" role="group" :aria-label="t('fingers')">
        <ToggleChip v-for="finger in FINGERS" :key="finger" class="finger" :pressed="now?.finger === finger" @update:pressed="emit('set', finger)">{{ finger }}</ToggleChip>
      </div>
      <AppButton variant="quiet" :label="t('fingerClear')" :disabled="!now?.own" @click="emit('set', null)">{{ t('fingerClear') }}</AppButton>
    </template>
    <AppNotice v-else class="ask">{{ t('fingerPick') }}</AppNotice>
    <AppButton class="done" :label="t('fingerDone')" @click="emit('done')">{{ t('fingerDone') }}</AppButton>
  </div>
</template>

<style scoped>
.finger-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-2), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  border-top: var(--edge) solid var(--border);
  background: var(--panel);
}

.note {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.ask {
  /* The prompt shares the row with Done and wraps within it, instead of pushing Done below. */
  flex: 1 1 0;
  min-width: 0;
}

.fingers {
  display: flex;
  gap: var(--space-1);
  font-variant-numeric: tabular-nums;
}

.finger {
  min-width: var(--touch);
}

.done {
  margin-left: auto;
}
</style>
