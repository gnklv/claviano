<script setup lang="ts" generic="T extends string">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

defineProps<{
  /** With an `icon`, that is shown in place of the label, and the label is what is read out and shown on hover. */
  options: readonly { value: T; label: string; icon?: IconName }[];
  /** Accessible name of the whole group. */
  label: string;
  /** Held as it is: shown, and not to be changed (a time signature through a take). */
  disabled?: boolean;
  /** As wide as the room it is given, its choices of one width: where it has a row to itself. */
  wide?: boolean;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented" :class="{ wide }" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      class="option"
      :class="{ active: option.value === model }"
      :aria-pressed="option.value === model"
      :title="option.icon && option.label"
      :aria-label="option.icon && option.label"
      :disabled="disabled"
      @click="model = option.value"
    >
      <AppIcon v-if="option.icon" :name="option.icon" small />
      <template v-else>{{ option.label }}</template>
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
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}

/* Under a finger: taller, and the words a size up. */
@media (pointer: coarse), (max-width: 599px) {
  .option {
    min-width: var(--touch);
    min-height: var(--touch);
    padding-inline: var(--space-3);
    font-size: var(--text-m);
  }
}

.option + .option {
  border-left: 1px solid var(--border);
}

.wide {
  display: flex;
}

.wide .option {
  flex: 1;
}

.option:disabled {
  opacity: 0.4;
  cursor: default;
}

.option.active {
  background: var(--control);
  color: var(--text);
}
</style>
