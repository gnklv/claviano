import { ref, watch } from 'vue';

const STORAGE_KEY = 'claviano.fingerHints';

function initial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    // Storage can be unavailable; off is the default anyway.
    return false;
  }
}

/** Whether fingers are offered where the notes give none. Off unless asked for; remembered between visits. */
const fingerHints = ref(initial());

watch(fingerHints, (on) => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembering the choice is fine.
  }
});

export function useFingerHints() {
  return fingerHints;
}
