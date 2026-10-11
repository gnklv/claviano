<script setup lang="ts">
/*
 * Word of something the person should know, said in the page: quietly, of how things stand; or as
 * an `alert`, of something gone wrong, framed in the colour of danger. A screen reader is told both.
 */
defineProps<{ alert?: boolean }>();
</script>

<template>
  <p class="notice" :class="{ alert }" :role="alert ? 'alert' : 'status'"><slot /></p>
</template>

<style scoped>
.notice {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-s);
}

.alert {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-m);
  color: var(--text);
  font-size: inherit;
}
</style>
