<script setup lang="ts">
/*
 * A menu's choices, one under another (inside a PopOver whose role is "menu"). A choice is told
 * with `choose`; whether the menu then closes is its owner's to say (a choice asked twice stays).
 */
defineProps<{
  /** `danger`: what cannot be undone. */
  items: readonly { id: string; label: string; danger?: boolean }[];
}>();
defineEmits<{ choose: [id: string] }>();
</script>

<template>
  <div class="menu-list">
    <button v-for="item in items" :key="item.id" class="item" :class="{ danger: item.danger }" role="menuitem" @click="$emit('choose', item.id)">
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.menu-list {
  display: grid;
  min-width: 180px;
  padding: var(--space-1);
}

.item {
  appearance: none;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.item:hover,
.item:focus-visible {
  background: var(--control-hover);
}

.item.danger {
  color: var(--danger);
}

/* Under a finger: rows a fingertip tall. */
@media (pointer: coarse), (max-width: 599px) {
  .item {
    min-height: var(--touch);
  }
}
</style>
