<script setup lang="ts">
/*
 * A piece as a tile on a shelf: its name, as a title, and a note under it; a press opens it. One's
 * own pieces and the demos are both this.
 *
 * The default slot is what stands over the tile (a piece's "more"); `face` takes the place of the
 * name and the note (a field, while the piece is being renamed).
 */
defineProps<{
  title: string;
  note?: string | null;
  /** A lower tile: for what is on the shelf but is nobody's (the demos). */
  low?: boolean;
}>();
defineEmits<{ open: [] }>();
</script>

<template>
  <div class="piece-tile" :class="{ still: $slots.face, low }">
    <div v-if="$slots.face" class="face"><slot name="face" /></div>
    <button v-else class="face" type="button" @click="$emit('open')">
      <span class="name">{{ title }}</span>
      <span v-if="note" class="note">{{ note }}</span>
    </button>
    <slot />
  </div>
</template>

<style scoped>
/* (As tall as a title of two lines and the note under it, so that the tiles of a row stand even; by eye.) */
.piece-tile {
  position: relative;
  display: grid;
  min-height: 120px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.piece-tile:hover,
.piece-tile:focus-within {
  background: var(--control-hover);
}

/* (Not while something else stands in its face: it is not pressable then.) */
.piece-tile.still {
  background: var(--panel);
}

/* The whole tile is the button that opens the piece; what else there is stands over its corner. */
.face {
  appearance: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-1);
  min-width: 0;
  margin: 0;
  padding: var(--space-4);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
}

button.face {
  cursor: pointer;
}

.name {
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  font-size: var(--text-l);
  /* A long title takes two lines, and no more. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.note {
  color: var(--muted);
}

.low {
  min-height: 0;
}

.low .face {
  padding-block: var(--space-3);
}

/* A phone: lower tiles, one to a row (a title of one line and its note). */
@media (max-width: 599px) {
  .piece-tile {
    min-height: 72px;
  }

  .low {
    min-height: 0;
  }
}
</style>
