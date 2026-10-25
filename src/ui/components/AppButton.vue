<script setup lang="ts">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

/*
 * A button: an icon, words, or both (an icon beside words is the smaller one). Its look is of the
 * whole interface's (".button" in ui/styles.css). What a place needs of it otherwise it asks for
 * here, by name: a place does not restyle it from outside (see "The interface" in docs/rules.md).
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
  /** A pill, as a chip is: in a bar of chips and buttons together (the transport), one shape. */
  pill?: boolean;
  /** An icon alone in a circle as large as a fingertip: a step of a number, either side of it (a tempo). */
  round?: boolean;
  /** Its icon in the colour of recording: what begins a take, or ends it. */
  recording?: boolean;
  /** A row of a list: as wide as its place, its words from its start and taking the room, so that what follows them stands at the end. */
  row?: boolean;
}>();
</script>

<template>
  <button class="button" :class="[variant, { pill, round, recording, row }]" type="button" :title="hint ?? label" :aria-label="label">
    <AppIcon v-if="icon" :name="icon" :small="!!$slots.default" />
    <span v-if="$slots.default" class="words"><slot /></span>
  </button>
</template>
