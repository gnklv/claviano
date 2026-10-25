<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from '../i18n/useI18n';
import AppButton from './AppButton.vue';
import MenuList from './MenuList.vue';
import PieceTile from './PieceTile.vue';
import PopOver from './PopOver.vue';
import TextField from './TextField.vue';

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
const field = useTemplateRef<{ take(): void }>('field');

async function startRenaming(): Promise<void> {
  menu.value = false;
  typed.value = props.title;
  renaming.value = true;
  await nextTick();
  field.value?.take();
}

function finishRenaming(keep: boolean): void {
  if (!renaming.value) return;
  renaming.value = false;
  const title = typed.value.trim();
  if (keep && title && title !== props.title) emit('rename', title);
}
</script>

<template>
  <PieceTile class="piece-card" :title="title" :note="note" @open="emit('open')">
    <template v-if="renaming" #face>
      <form class="renaming" @submit.prevent="finishRenaming(true)">
        <TextField ref="field" v-model="typed" class="field" maxlength="200" :label="t('pieceTitle')" @blur="finishRenaming(true)" @keydown.esc.stop="finishRenaming(false)" />
        <span class="note">{{ note }}</span>
      </form>
    </template>

    <PopOver v-model:open="menu" class="actions" place="below" role="menu" :label="t('pieceActions')">
      <AppButton variant="quiet" icon="more" :label="`${t('pieceActions')}: ${title}`" :hint="t('pieceActions')" :aria-expanded="menu" @click="menu = !menu" />
      <template #panel><MenuList :items="actions" @choose="choose" /></template>
    </PopOver>
  </PieceTile>
</template>

<style scoped>
.renaming {
  display: grid;
  gap: var(--space-1);
}

.field {
  width: 100%;
}

.note {
  color: var(--muted);
}

/* (Over the tile's corner.) */
.actions {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}
</style>
