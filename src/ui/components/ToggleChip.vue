<script setup lang="ts">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

/*
 * A chip that is on or off: pressed, it turns the other way. For what is switched while playing
 * (a hand, the metronome, the loop) and for one of a few values (a tempo). Its look is of the whole
 * interface's (".toggle" in ui/styles.css).
 *
 * `sign` is a slot for a mark before the words that is not an icon of the set (a hand's dot).
 */
defineProps<{ icon?: IconName }>();
const pressed = defineModel<boolean>('pressed', { required: true });
</script>

<template>
  <button class="toggle" type="button" :aria-pressed="pressed" @click="pressed = !pressed">
    <AppIcon v-if="icon" :name="icon" small />
    <slot name="sign" />
    <span class="words"><slot /></span>
  </button>
</template>
