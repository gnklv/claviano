<script setup lang="ts">
import { computed } from 'vue';

/*
 * A slider: a value between `min` and `max`, inked as far as it goes (the look is in styles.css,
 * shared with the transport's slider, which is set at every frame by hand and so is not this).
 */
const props = withDefaults(defineProps<{ min?: number; max?: number; step?: number; label?: string; disabled?: boolean }>(), { min: 0, max: 100, step: 1 });
const value = defineModel<number>({ required: true });

/** How far the track is inked: the browser gives a track no way to know its own value. */
const fill = computed(() => `${((value.value - props.min) / (props.max - props.min)) * 100}%`);
</script>

<template>
  <input
    class="slider"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    :value="value"
    :style="{ '--fill': fill }"
    @input="value = Number(($event.target as HTMLInputElement).value)"
  />
</template>
