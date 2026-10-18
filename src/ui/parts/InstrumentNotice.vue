<script setup lang="ts">
import { useMirror } from '../composables/useMirror';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/** A small note over the music while the piano's sound is not in yet (a simpler synth plays meanwhile). */
const { instrument } = useDeps();
const { t } = useI18n();
// Nothing to say while the piano is turned off: the synth is what was asked for.
const status = useMirror(instrument, () => (instrument.enabled && instrument.status !== 'ready' ? instrument.status : null));
</script>

<template>
  <div v-if="status" class="notice" role="status">
    {{ t(status === 'loading' ? 'instrumentLoading' : 'instrumentUnavailable') }}
  </div>
</template>

<style scoped>
.notice {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-xs);
  pointer-events: none;
}

/* Samples usually arrive at once: the note shows only if they take a while. */
.notice {
  animation: appear var(--quick) 0.4s backwards;
}

@keyframes appear {
  from {
    opacity: 0;
  }
}
</style>
