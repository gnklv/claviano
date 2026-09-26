<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import type { SvgStaff } from '../../infrastructure/render/SvgStaff';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { usePlaybackState } from '../composables/usePlaybackState';
import { useDeps } from '../deps';

const { playback, createStaff } = useDeps();
const state = usePlaybackState(playback);
const container = useTemplateRef<HTMLDivElement>('container');

let staff: SvgStaff | null = null;
const resizeObserver = new ResizeObserver(() => staff?.resize());

onMounted(() => {
  staff = createStaff(container.value!);
  staff.setScore(state.value.score);
  staff.setLoop(state.value.loop);
  resizeObserver.observe(container.value!);
});
onUnmounted(() => resizeObserver.disconnect());

// The tape is rebuilt only when the score or the loop changes…
watch(
  () => state.value.score,
  (score) => staff?.setScore(score),
);
watch(
  () => state.value.loop,
  (loop) => staff?.setLoop(loop),
);

// …and only slides during playback, outside Vue's reactivity.
useAnimationFrame(() => staff?.render(playback.position));
</script>

<template>
  <div ref="container" class="staff" />
</template>

<style scoped>
.staff {
  width: 100%;
  height: 100%;
}
</style>
