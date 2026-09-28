<script setup lang="ts">
import { ref } from 'vue';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';

/** The count-in beat, big over the music: "1", "2", "3", "4", then the music starts. */
const { playback } = useDeps();
const beat = ref<number | null>(null);

useAnimationFrame(() => {
  const now = playback.countInBeat;
  if (now !== beat.value) beat.value = now;
});
</script>

<template>
  <div v-if="beat !== null" :key="beat" class="count-in" aria-live="assertive">{{ beat }}</div>
</template>

<style scoped>
.count-in {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: clamp(72px, 20vmin, 180px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  pointer-events: none;
  /* Each beat pops in (the :key makes it a new element). */
  animation: pop 0.25s ease-out;
}

@keyframes pop {
  from {
    opacity: 0;
    scale: 1.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .count-in {
    animation: none;
  }
}
</style>
