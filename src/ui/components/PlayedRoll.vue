<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import type { PlayedTile, TilesView } from '../../application/ports/TilesView';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';
import { useTheme } from '../theme/useTheme';

/*
 * What has just been played, over the keyboard: tiles that rise from the keys (see TilesView).
 * This keeps what was played, for as long as it is in sight, and hands it to the view each frame.
 */
const props = defineProps<{ lowest: number; keys: number }>();

const { freePlay, createTiles } = useDeps();
const { theme } = useTheme();
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

let view: TilesView | null = null;
let tiles: PlayedTile[] = [];
const stopListening = freePlay.onKey((pitch, down, at) => {
  if (down) tiles.push({ pitch, start: at, end: null });
  // (Every open tile of the key: one, unless a key-up was missed.)
  else tiles = tiles.map((tile) => (tile.pitch === pitch && tile.end === null ? { ...tile, end: at } : tile));
});

/** The hands' colours, from the theme: a canvas cannot follow CSS variables by itself. */
function colors() {
  const style = getComputedStyle(document.documentElement);
  return { right: style.getPropertyValue('--right').trim(), left: style.getPropertyValue('--left').trim() };
}

function draw(): void {
  if (!view) return;
  const now = freePlay.now();
  // What has floated off the top is forgotten.
  const inSight = view.secondsInSight;
  tiles = tiles.filter((tile) => tile.end === null || now - tile.end < inSight);
  view.render({ tiles, now, lowest: props.lowest, keys: props.keys });
}

// (Resizing a canvas wipes it: drawn again at once, or the frame goes out blank.)
const resizeObserver = new ResizeObserver(() => {
  view?.resize();
  draw();
});

onMounted(() => {
  view = createTiles(canvas.value!);
  view.setColors(colors());
  resizeObserver.observe(canvas.value!);
});
onUnmounted(() => {
  resizeObserver.disconnect();
  stopListening();
});
watch(theme, () => view?.setColors(colors()), { flush: 'post' });
useAnimationFrame(draw);
</script>

<template>
  <div class="played"><canvas ref="canvas" class="tiles" /></div>
</template>

<style scoped>
/* (The canvas is laid over its box, as the piece's roll is: its size is the room it is given.) */
.played {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.tiles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
