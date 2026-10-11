<script setup lang="ts" generic="T extends string">
defineProps<{
  /** `title` is shown on hover and read by screen readers; use it when `label` is an icon. */
  options: readonly { value: T; label: string; title?: string }[];
  /** Accessible name of the whole group. */
  label: string;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      class="option"
      :class="{ active: option.value === model }"
      :aria-pressed="option.value === model"
      :title="option.title"
      :aria-label="option.title"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  overflow: hidden;
}

.option {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--text-xs);
  padding: 5px 10px;
  cursor: pointer;
}

/* Under a finger: taller, and the words a size up. */
@media (pointer: coarse), (max-width: 599px) {
  .option {
    min-width: var(--touch);
    min-height: 40px;
    padding-inline: 12px;
    font-size: var(--text-m);
  }
}

.option + .option {
  border-left: 1px solid var(--border);
}

.option.active {
  background: var(--control);
  color: var(--text);
}
</style>
