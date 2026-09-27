<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { EMPTY_SCORE } from '../../domain/score';
import type { CanvasPianoRoll } from '../../infrastructure/render/CanvasPianoRoll';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import { readRollColors } from '../theme/readRollColors';
import { useTheme } from '../theme/useTheme';

const { playback, createRoll } = useDeps();
const { noteLabel } = useI18n();
const { theme } = useTheme();
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

let roll: CanvasPianoRoll | null = null;
const resizeObserver = new ResizeObserver(() => roll?.resize());

onMounted(() => {
  roll = createRoll(canvas.value!);
  roll.setColors(readRollColors());
  resizeObserver.observe(canvas.value!);
});

// Canvas can't follow CSS variables by itself; re-read them once the new theme is applied.
watch(theme, () => roll?.setColors(readRollColors()), { flush: 'post' });
onUnmounted(() => resizeObserver.disconnect());

// Drawn outside Vue's reactivity: 60 fps straight from Playback to the canvas.
useAnimationFrame(() =>
  roll?.render({
    score: playback.score ?? EMPTY_SCORE,
    position: playback.position,
    loop: playback.loop,
    isHandEnabled: (hand) => playback.isHandEnabled(hand),
    noteLabel,
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
