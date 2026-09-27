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
  border-radius: 8px;
  overflow: hidden;
}

.option {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
}

.option + .option {
  border-left: 1px solid var(--border);
}

.option.active {
  background: var(--control);
  color: var(--text);
}
</style>
