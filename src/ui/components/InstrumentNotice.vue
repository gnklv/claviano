<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';

/** A small note over the music while the piano's sound is not in yet (a simpler synth plays meanwhile). */
const { instrument } = useDeps();
const { t } = useI18n();
const status = ref(instrument.status);
onScopeDispose(instrument.onStatusChange(() => (status.value = instrument.status)));
</script>

<template>
  <div v-if="status !== 'ready'" class="notice" role="status">
    {{ t(status === 'loading' ? 'instrumentLoading' : 'instrumentUnavailable') }}
  </div>
</template>

<style scoped>
.notice {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  pointer-events: none;
}

/* Samples usually arrive at once: the note shows only if they take a while. */
.notice {
  animation: appear 0.3s 0.4s backwards;
}

@keyframes appear {
  from {
    opacity: 0;
  }
}
</style>
