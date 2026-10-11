<script setup lang="ts">
/*
 * A row of settings: what is set, on the left, and the control that sets it, on the right. As a
 * `label`, a press on the words is a press on the control (a slider).
 */
defineProps<{ label: string; tag?: 'div' | 'label' }>();
</script>

<template>
  <component :is="tag ?? 'div'" class="setting-row">
    <span class="label">{{ label }}</span>
    <slot />
  </component>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* (Where the words and the control do not fit a row, the control goes under the words.) */
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}

.label {
  color: var(--muted);
}
</style>
