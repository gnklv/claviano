<script setup lang="ts" generic="T extends string | number">
import { useTemplateRef } from 'vue';

/*
 * A field to type into: a name, a number. Its text is never smaller than 16px under a finger:
 * Safari on an iPhone zooms the page into a field with smaller text.
 */
defineProps<{
  /** What the field is, for a screen reader (it has no words of its own beside it). */
  label: string;
  type?: 'text' | 'number';
}>();
const model = defineModel<T>({ required: true });

const input = useTemplateRef<HTMLInputElement>('input');
defineExpose({
  /** Puts the cursor in the field, with what is in it selected: typing replaces it. */
  take(): void {
    input.value?.focus();
    input.value?.select();
  },
});
</script>

<template>
  <input ref="input" v-model="model" class="text-field" :type="type ?? 'text'" :aria-label="label" />
</template>

<style scoped>
.text-field {
  box-sizing: border-box;
  padding: 3px var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--control);
  color: var(--text);
  font: inherit;
}

.text-field:focus-visible {
  border-color: var(--accent);
  outline: none;
}

.text-field:disabled {
  opacity: 0.4;
}

/* Under a finger: as tall as the buttons beside it. */
@media (pointer: coarse), (max-width: 599px) {
  .text-field {
    min-height: var(--touch);
    font-size: var(--text-field);
  }
}
</style>
