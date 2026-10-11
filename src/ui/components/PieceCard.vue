<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from '../i18n/useI18n';
import MenuList from './MenuList.vue';
import PopOver from './PopOver.vue';

/*
 * A piece on the shelf: a press opens it; behind "⋯" is what else can be done with it: giving it
 * another name, saving its file out, taking it off the shelf (asked twice: it cannot be undone).
 */
const props = defineProps<{ title: string; note: string }>();
const emit = defineEmits<{ open: []; rename: [title: string]; save: []; remove: [] }>();

const { t } = useI18n();

// --- The menu: what else can be done with the piece. ---

const menu = ref(false);
/** "Remove" was pressed once: the next press removes. */
const sure = ref(false);
watch(menu, () => (sure.value = false));

type Action = 'rename' | 'save' | 'remove';
const actions = computed((): { id: Action; label: string; danger?: boolean }[] => [
  { id: 'rename', label: t('rename') },
  { id: 'save', label: t('saveAsFile') },
  { id: 'remove', label: t(sure.value ? 'removeConfirm' : 'removeFromShelf'), danger: true },
]);

function choose(action: string): void {
  if (action === 'rename') return void startRenaming();
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
  <div class="piece-card" :class="{ renaming }">
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

    <PopOver v-model:open="menu" class="actions" place="below" role="menu" :label="t('pieceActions')">
      <button class="button more" :title="t('pieceActions')" :aria-label="`${t('pieceActions')}: ${title}`" :aria-expanded="menu" @click="menu = !menu"><AppIcon name="more" /></button>
      <template #panel><MenuList :items="actions" @choose="choose" /></template>
    </PopOver>
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

/* (Over the card's corner.) */
.actions {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}

.more {
  padding: 2px var(--space-2);
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.more:hover,
.more[aria-expanded='true'] {
  border-color: var(--border);
  background: var(--control);
  color: var(--text);
}

/* A phone: lower cards (as the library's others). */
@media (max-width: 520px) {
  .piece-card {
    min-height: 72px;
  }
}
</style>
