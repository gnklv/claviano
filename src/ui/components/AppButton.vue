<script setup lang="ts">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

/*
 * A button: an icon, words, or both (an icon beside words is the smaller one). Its look is of the
 * whole interface's (".button" in ui/styles.css), so that a place may still fit it to itself.
 *
 * `primary` is the one main action of a screen, in the accent. `quiet` has no face until it is
 * reached for: for what stands over something else (a card's "more").
 */
defineProps<{
  icon?: IconName;
  /** The name of a button that is an icon alone: read out, and shown on hover. */
  label?: string;
  /** What is shown on hover, where that says more than the name (a key that does the same). */
  hint?: string;
  variant?: 'primary' | 'quiet';
}>();
</script>

<template>
  <button class="button" :class="variant" type="button" :title="hint ?? label" :aria-label="label">
    <AppIcon v-if="icon" :name="icon" :small="!!$slots.default" />
    <slot />
  </button>
</template>
