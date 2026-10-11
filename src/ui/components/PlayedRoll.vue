<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { useAnimationFrame } from '../composables/useAnimationFrame';
import { useDeps } from '../deps';
import { keyPlace, whiteKeys } from './keyPlaces';

/*
 * What has just been played, over the keyboard: each note a tile that rises from its key as long
 * as the key is held, and floats on up. (The falling notes of a piece, the other way round: there
 * the music comes to the keys; here it leaves them.)
 */
const props = defineProps<{ lowest: number; keys: number }>();

const { freePlay } = useDeps();

/** A second of playing is this tall, in pixels. */
const PX_PER_SECOND = 90;
/** Notes at and over this key are the right hand's (as for a file that does not say). */
const RIGHT_HAND_FROM = 60;

interface Tile {
  pitch: number;
  start: number;
  end: number | null;
}
let tiles: Tile[] = [];
const stopListening = freePlay.onKey((pitch, down, at) => {
  if (down) tiles.push({ pitch, start: at, end: null });
  else {
    for (const tile of tiles) if (tile.pitch === pitch && tile.end === null) tile.end = at;
  }
});

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
let width = 0;
let height = 0;

function resize(): void {
  const element = canvas.value;
  if (!element) return;
  const dpr = window.devicePixelRatio || 1;
  width = element.clientWidth;
  height = element.clientHeight;
  element.width = Math.round(width * dpr);
  element.height = Math.round(height * dpr);
  element.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw(): void {
  const context = canvas.value?.getContext('2d');
  if (!context || width === 0) return;
  const now = freePlay.now();
  // What has floated off the top is forgotten.
  tiles = tiles.filter((tile) => tile.end === null || (now - tile.end) * PX_PER_SECOND < height);
  context.clearRect(0, 0, width, height);
  const style = getComputedStyle(canvas.value!);
  const colours = { right: style.getPropertyValue('--right').trim(), left: style.getPropertyValue('--left').trim() };
  const white = width / whiteKeys(props.lowest, props.keys);
  for (const tile of tiles) {
    const place = keyPlace(tile.pitch, props.lowest);
    const bottom = height - (now - (tile.end ?? now)) * PX_PER_SECOND;
    const top = height - (now - tile.start) * PX_PER_SECOND;
    context.fillStyle = tile.pitch >= RIGHT_HAND_FROM ? colours.right : colours.left;
    context.beginPath();
    context.roundRect(place.left * white + 1, top, place.width * white - 2, Math.max(3, bottom - top), 3);
    context.fill();
  }
}

const resizeObserver = new ResizeObserver(resize);
onMounted(() => canvas.value && resizeObserver.observe(canvas.value));
onUnmounted(() => {
  resizeObserver.disconnect();
  stopListening();
});
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
