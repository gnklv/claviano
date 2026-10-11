import { computed, type WritableComputedRef } from 'vue';
import { preference } from '../preferences';

const kept = preference<'on' | 'off'>('claviano.fingerHints', ['on', 'off'], 'off');
/** Whether fingers are offered where the notes give none. Off unless asked for; remembered between visits. */
const fingerHints = computed({ get: () => kept.value === 'on', set: (on: boolean) => (kept.value = on ? 'on' : 'off') });

export function useFingerHints(): WritableComputedRef<boolean> {
  return fingerHints;
}
