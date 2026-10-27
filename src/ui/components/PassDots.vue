<script setup lang="ts">
/*
 * Passes played clean in a row, out of those wanted: a ring for each, filled for each made. Read
 * at a glance between two passes, as the hands' rings beside them are.
 */
defineProps<{ count: number; of: number; /** What it says, read out. */ label: string }>();
</script>

<template>
  <span class="pass-dots" role="img" :aria-label="label">
    <span v-for="pass in of" :key="pass" class="dot" :class="{ made: pass <= count }" />
  </span>
</template>

<style scoped>
.pass-dots {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

/* (The size of the hands' rings in the practice toggles: one kind of mark in one bar.) */
.dot {
  width: var(--dot);
  height: var(--dot);
  border-radius: 50%;
  border: var(--stroke) solid var(--muted);
  transition: background-color var(--quick) var(--glide), border-color var(--quick) var(--glide);
}

.made {
  border-color: var(--text);
  background: var(--text);
}
</style>
