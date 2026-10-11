<script setup lang="ts">
import { nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from '../i18n/useI18n';

/*
 * A piece on the shelf: a press opens it; behind "⋯" is what else can be done with it: giving it
 * another name, saving its file out, taking it off the shelf (asked twice: it cannot be undone).
 */
const props = defineProps<{ title: string; note: string }>();
const emit = defineEmits<{ open: []; rename: [title: string]; save: []; remove: [] }>();

const { t } = useI18n();
const root = useTemplateRef<HTMLElement>('root');

// --- The menu: open until Esc, a press anywhere outside it, or a choice. ---

const menu = ref(false);
/** "Remove" was pressed once: the next press removes. */
const sure = ref(false);

function onPressOutside(event: Event): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) menu.value = false;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') menu.value = false;
}

function listen(on: boolean): void {
  const change = on ? 'addEventListener' : 'removeEventListener';
  document[change]('pointerdown', onPressOutside);
  document[change]('keydown', onKeyDown as EventListener);
}

watch(menu, (open) => {
  listen(open);
  sure.value = false;
});
onUnmounted(() => listen(false));

function choose(action: 'save' | 'remove'): void {
  if (action === 'remove' && !sure.value) {
    sure.value = true;
    return;
  }
  menu.value = false;
  if (action === 'save') emit('save');
  else emit('remove');
}

// --- Renaming: the name becomes a field, in place. Enter (or leaving it) keeps the name, Esc does not. ---

const renaming = ref(false);
const typed = ref('');
const field = useTemplateRef<HTMLInputElement>('field');

async function startRenaming(): Promise<void> {
  menu.value = false;
  typed.value = props.title;
  renaming.value = true;
  await nextTick();
  field.value?.focus();
  field.value?.select();
}

function finishRenaming(keep: boolean): void {
  if (!renaming.value) return;
  renaming.value = false;
  const title = typed.value.trim();
  if (keep && title && title !== props.title) emit('rename', title);
}
</script>

<template>
  <div ref="root" class="piece-card" :class="{ renaming }">
    <form v-if="renaming" class="face" @submit.prevent="finishRenaming(true)">
      <input
        ref="field"
        v-model="typed"
        class="field"
        type="text"
        maxlength="200"
        :aria-label="t('pieceTitle')"
        @blur="finishRenaming(true)"
        @keydown.esc.stop="finishRenaming(false)"
      />
      <span class="note">{{ note }}</span>
    </form>
    <button v-else class="face" @click="emit('open')">
      <span class="name">{{ title }}</span>
      <span class="note">{{ note }}</span>
    </button>

    <button class="button more" :title="t('pieceActions')" :aria-label="`${t('pieceActions')}: ${title}`" :aria-expanded="menu" @click="menu = !menu">⋯</button>
    <div v-if="menu" class="menu" role="menu">
      <button class="item" role="menuitem" @click="startRenaming">{{ t('rename') }}</button>
      <button class="item" role="menuitem" @click="choose('save')">{{ t('saveAsFile') }}</button>
      <button class="item danger" role="menuitem" @click="choose('remove')">{{ t(sure ? 'removeConfirm' : 'removeFromShelf') }}</button>
    </div>
  </div>
</template>

<style scoped>
.piece-card {
  position: relative;
  display: grid;
  min-height: 120px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.piece-card:hover,
.piece-card:focus-within {
  background: var(--control-hover);
}

.piece-card.renaming {
  background: var(--panel);
}

/* The whole card is the button that opens the piece; "⋯" stands over its corner. */
.face {
  appearance: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 16px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.name {
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  font-size: var(--text-l);
  /* A long title takes two lines, and no more. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.note {
  color: var(--muted);
}

.field {
  box-sizing: border-box;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-s);
  background: var(--bg);
  color: var(--text);
  /* (16px: Safari on iOS zooms into a field with smaller text.) */
  font: inherit;
  font-size: var(--text-field);
}

.more {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
  line-height: 1;
}

.more:hover,
.more[aria-expanded='true'] {
  border-color: var(--border);
  background: var(--control);
  color: var(--text);
}

.menu {
  position: absolute;
  top: 44px;
  right: 8px;
  z-index: 10;
  display: grid;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
  box-shadow: 0 10px 32px rgb(0 0 0 / 0.25);
}

.item {
  appearance: none;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.item:hover,
.item:focus-visible {
  background: var(--control-hover);
}

.item.danger {
  color: var(--left);
}

/* Under a finger: rows a fingertip tall, and the menu clear of the taller "⋯". */
@media (pointer: coarse), (max-width: 599px) {
  .item {
    min-height: var(--touch);
  }

  .menu {
    top: 56px;
  }
}

/* A phone: lower cards (as the library's others). */
@media (max-width: 520px) {
  .piece-card {
    min-height: 72px;
  }
}
</style>
