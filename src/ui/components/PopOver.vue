<script setup lang="ts">
import { onUnmounted, useTemplateRef, watch } from 'vue';

/*
 * A small panel that opens beside the button that asks for it, and is open until Esc, a press
 * anywhere outside it, or whoever opened it closes it (a choice was made). The one pop-up of the
 * interface: the tempo's panel and a piece's menu are both this.
 *
 * The default slot is the button; `panel` is what opens. Whether it is open is the parent's to say
 * (v-model:open): the button is the parent's too, and presses it as it likes.
 */
defineProps<{
  /** Where the panel stands: over the button, in the middle of it; or under it, against its right edge. */
  place: 'above' | 'below';
  /** What the panel is, for a screen reader. */
  label: string;
  /** A panel of choices is a menu; of controls, a group. */
  role?: 'group' | 'menu';
}>();
const open = defineModel<boolean>('open', { required: true });

const root = useTemplateRef<HTMLElement>('root');

function onPressOutside(event: Event): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

function listen(on: boolean): void {
  const change = on ? 'addEventListener' : 'removeEventListener';
  document[change]('pointerdown', onPressOutside);
  document[change]('keydown', onKeyDown as EventListener);
}

watch(open, listen, { immediate: true });
onUnmounted(() => listen(false));
</script>

<template>
  <div ref="root" class="pop-over">
    <slot />
    <Transition name="pop">
      <div v-if="open" class="panel" :class="place" :role="role ?? 'group'" :aria-label="label">
        <slot name="panel" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pop-over {
  position: relative;
  display: inline-flex;
}

.panel {
  position: absolute;
  z-index: 10;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
  box-shadow: var(--shadow-raised);
}

.above {
  bottom: calc(100% + var(--space-3));
  left: 50%;
  translate: -50% 0;
  transform-origin: bottom center;
}

.below {
  top: calc(100% + var(--space-1));
  right: 0;
  transform-origin: top right;
}

/* It grows a little out of its button as it comes, and back into it as it goes (see "Motion" in ui/styles.css). */
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity var(--quick) ease-out,
    scale var(--quick) ease-out;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  scale: 0.96;
}
</style>
