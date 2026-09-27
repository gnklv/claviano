<script setup lang="ts">
import { useTemplateRef } from 'vue';
import type { Demo } from '../deps';
import { useI18n } from '../i18n/useI18n';

defineProps<{ demos: readonly Demo[] }>();
const emit = defineEmits<{ choose: [demo: Demo] }>();

const { t } = useI18n();
const id = 'demo-menu';
const button = useTemplateRef<HTMLButtonElement>('button');
const menu = useTemplateRef<HTMLDivElement>('menu');

/** Popovers open centred; place this one right under its button instead. */
function placeUnderButton(event: Event): void {
  if ((event as ToggleEvent).newState !== 'open' || !button.value || !menu.value) return;
  const rect = button.value.getBoundingClientRect();
  menu.value.style.top = `${rect.bottom + 6}px`;
  menu.value.style.left = `${rect.left}px`;
}

function choose(demo: Demo): void {
  menu.value?.hidePopover?.();
  emit('choose', demo);
}
</script>

<template>
  <!-- With the Popover API: one button and a menu. Without it: the demos as plain buttons. -->
  <div class="demo-menu">
    <button ref="button" class="button with-menu" :popovertarget="id">{{ t('demo') }} ▾</button>
    <div :id="id" ref="menu" class="menu" popover @beforetoggle="placeUnderButton">
      <button v-for="demo in demos" :key="demo.id" class="item" @click="choose(demo)">{{ t(demo.title) }}</button>
    </div>
  </div>
  <div class="demo-inline">
    <button v-for="demo in demos" :key="demo.id" class="button" @click="choose(demo)">{{ t(demo.title) }}</button>
  </div>
</template>

<style scoped>
.demo-inline {
  display: none;
}

@supports not selector(:popover-open) {
  .demo-menu {
    display: none;
  }

  .demo-inline {
    display: contents;
  }
}

.menu {
  position: fixed;
  margin: 0;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
  flex-direction: column;
  min-width: 220px;
  transition:
    opacity 0.15s ease-out,
    translate 0.15s ease-out,
    display 0.15s allow-discrete,
    overlay 0.15s allow-discrete;
}

.menu:popover-open {
  display: flex;
}

.menu:not(:popover-open) {
  opacity: 0;
  translate: 0 -4px;
}

@starting-style {
  .menu:popover-open {
    opacity: 0;
    translate: 0 -4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu {
    transition: none;
  }
}

.item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.item:hover,
.item:focus-visible {
  background: var(--control);
}
</style>
