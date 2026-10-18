<script setup lang="ts">
import { onUnmounted, useTemplateRef, watch } from 'vue';
import type { PlayedTile, TilesView } from '../../application/ports/TilesView';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDrawnView } from '../composables/useDrawnView';
import { readRollColors } from '../theme/readRollColors';
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

let played: PlayedTile[] = [];
const stopListening = freePlay.onKey((pitch, down, at) => {
  if (down) played.push({ pitch, start: at, end: null });
  // (Every open tile of the key: one, unless a key-up was missed.)
  else played = played.map((tile) => (tile.pitch === pitch && tile.end === null ? { ...tile, end: at } : tile));
});

/** The hands' colours, from the theme: a canvas cannot follow CSS variables by itself. */
const colors = () => readRollColors().hand;

function draw(): void {
  const view = tiles.view;
  if (!view) return;
  const now = freePlay.now();
  // What has floated off the top is forgotten.
  const inSight = view.secondsInSight;
  played = played.filter((tile) => tile.end === null || now - tile.end < inSight);
  view.render({ tiles: played, now, lowest: props.lowest, keys: props.keys });
}

// (Resizing a canvas wipes it: drawn again at once, or the frame goes out blank.)
const tiles = useDrawnView(
  canvas,
  (element): TilesView => createTiles(element, colors()),
  () => draw(),
);
onUnmounted(stopListening);
watch(theme, () => tiles.view?.setColors(colors()), { flush: 'post' });
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
