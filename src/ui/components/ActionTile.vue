<script setup lang="ts">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

/*
 * Something that can be begun, as a tile: a sign, what it is, and a word about it. Larger than a
 * button, for the few things a screen starts from; not a piece's tile, which it must not pass for.
 *
 * `main`: the one of them the screen is for; its sign is in the accent. As a `label` it can hold a
 * field of its own (a file to choose) in the default slot, and a press on it presses that.
 */
defineProps<{ icon: IconName; title: string; note?: string; main?: boolean; tag?: 'button' | 'label' }>();
</script>

<template>
  <component :is="tag ?? 'button'" class="action-tile" :class="{ main }" :type="tag === 'label' ? undefined : 'button'">
    <span class="sign"><AppIcon :name="icon" /></span>
    <span class="words">
      <span class="name">{{ title }}</span>
      <span v-if="note" class="note">{{ note }}</span>
    </span>
    <slot />
  </component>
</template>

<style scoped>
.action-tile {
  appearance: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.action-tile:hover,
.action-tile:focus-within {
  background: var(--control);
}

/* (A round sign, a little under a fingertip: the tile around it is what is pressed.) */
.sign {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--control);
  color: var(--text);
}

.action-tile:hover .sign,
.action-tile:focus-within .sign {
  background: var(--control-hover);
}

.main .sign,
.main:hover .sign,
.main:focus-within .sign {
  background: var(--accent);
  color: var(--on-accent);
}

.words {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.name,
.note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-size: var(--text-l);
}

.note {
  color: var(--muted);
}
</style>
