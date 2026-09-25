<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { CanvasPianoRoll } from '../../infrastructure/render/CanvasPianoRoll';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';

const { playback, createRoll } = useDeps();
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

let roll: CanvasPianoRoll | null = null;
const resizeObserver = new ResizeObserver(() => roll?.resize());

onMounted(() => {
  roll = createRoll(canvas.value!);
  resizeObserver.observe(canvas.value!);
});
onUnmounted(() => resizeObserver.disconnect());

// Drawn outside Vue's reactivity: 60 fps straight from Playback to the canvas.
useAnimationFrame(() =>
  roll?.render({
    score: playback.score ?? EMPTY_SCORE,
    position: playback.position,
    loop: playback.loop,
    isHandEnabled: (hand) => playback.isHandEnabled(hand),
  }),
);
</script>

<template>
  <canvas ref="canvas" class="roll" />
</template>

<style scoped>
.roll {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
