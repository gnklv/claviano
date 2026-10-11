<script setup lang="ts">
import type { IconName } from '../icons/icons';
import AppIcon from './AppIcon.vue';

/*
 * A chip that is on or off: pressed, it turns the other way. For what is switched while playing
 * (a hand, the metronome, the loop) and for one of a few values (a tempo). Its look is of the whole
 * interface's (".toggle" in ui/styles.css).
 */
defineProps<{ icon?: IconName }>();
const pressed = defineModel<boolean>('pressed', { required: true });
</script>

<template>
  <button class="toggle" type="button" :aria-pressed="pressed" @click="pressed = !pressed">
    <AppIcon v-if="icon" :name="icon" small />
    <slot />
  </button>
</template>
