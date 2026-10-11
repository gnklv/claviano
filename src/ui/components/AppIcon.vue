<script setup lang="ts">
import { ICONS, type IconName } from '../icons/icons';

/*
 * An icon of the set (ui/icons/icons.ts). It says nothing to a screen reader: the button it sits in
 * carries the name.
 */
defineProps<{ name: IconName; small?: boolean }>();
</script>

<template>
  <svg class="icon" :class="{ small }" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path v-for="(part, index) in ICONS[name]" :key="index" :d="part.d" :class="{ solid: part.solid }" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  width: var(--icon);
  height: var(--icon);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.small {
  width: var(--icon-s);
  height: var(--icon-s);
}

/* (A solid shape keeps the line around it: its corners come out as round as the lines' ends.) */
.solid {
  fill: currentColor;
}
</style>
