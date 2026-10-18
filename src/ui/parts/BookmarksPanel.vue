<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';
import { useBookmarks } from '../composables/useBookmarks';
import { useDeps } from '../deps';
import { useI18n } from '../i18n/useI18n';
import AppButton from '../components/AppButton.vue';
import AppNotice from '../components/AppNotice.vue';
import TextField from '../components/TextField.vue';

/*
 * The piece's bookmarks: a press goes to one (and the panel is done with); one is changed in place
 * (its name, or taken away); a new one is added at the bar the music is in.
 */
const props = defineProps<{ /** The printed bar the music is in now. */ bar: number }>();
const emit = defineEmits<{ done: [] }>();

const { bookmarks } = useDeps();
const { t } = useI18n();
const list = useBookmarks(bookmarks);

function go(index: number): void {
  bookmarks.goTo(index);
  emit('done');
}

// --- A new one, at the bar the music is in: named as the bar, unless given a name. ---

const name = ref('');
function add(): void {
  bookmarks.add(name.value.trim() || t('bookmarkDefault', { bar: props.bar }), props.bar);
  name.value = '';
}

// --- One changed in place: its name a field; Enter (or leaving it) keeps the name, Esc does not. ---

const editing = ref<number | null>(null);
const typed = ref('');
const field = useTemplateRef<{ take(): void }[]>('field');

async function edit(index: number): Promise<void> {
  editing.value = index;
  typed.value = list.value[index]?.name ?? '';
  await nextTick();
  field.value?.[0]?.take();
}

function finish(keep: boolean): void {
  const index = editing.value;
  if (index === null) return;
  editing.value = null;
  if (keep) bookmarks.rename(index, typed.value);
}

function remove(index: number): void {
  editing.value = null;
  bookmarks.remove(index);
}
</script>

<template>
  <div class="bookmarks">
    <AppNotice v-if="list.length === 0">{{ t('bookmarksNone') }}</AppNotice>
    <ul v-else class="list">
      <li v-for="(bookmark, index) in list" :key="`${index}:${bookmark.bar}:${bookmark.name}`" class="row">
        <form v-if="editing === index" class="editing" @submit.prevent="finish(true)">
          <TextField ref="field" v-model="typed" class="name" maxlength="80" :label="t('bookmarkName')" @keydown.esc.stop="finish(false)" />
          <AppButton variant="quiet" :label="t('bookmarkRemove')" class="remove" @click="remove(index)">{{ t('bookmarkRemove') }}</AppButton>
          <AppButton :label="t('bookmarkDone')" @click="finish(true)">{{ t('bookmarkDone') }}</AppButton>
        </form>
        <template v-else>
          <button class="go" @click="go(index)">
            <span class="title">{{ bookmark.name }}</span>
            <span class="at">{{ t('bookmarkAt', { bar: bookmark.bar }) }}</span>
          </button>
          <AppButton variant="quiet" icon="more" :label="`${t('bookmarkEdit')}: ${bookmark.name}`" :hint="t('bookmarkEdit')" @click="edit(index)" />
        </template>
      </li>
    </ul>
    <form class="add" @submit.prevent="add">
      <TextField v-model="name" class="name" maxlength="80" :label="t('bookmarkHere', { bar })" :placeholder="t('bookmarkDefault', { bar })" />
      <AppButton variant="primary" :label="t('bookmarkHere', { bar })" @click="add">{{ t('bookmarkAdd') }}</AppButton>
    </form>
  </div>
</template>

<style scoped>
.bookmarks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
}

.list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row,
.editing,
.add {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* (One height, read or being changed: a row does not jump when its name becomes a field.) */
  min-height: var(--touch);
  /* (No wider than the panel: a long name is cut short, it does not push the panel out.) */
  min-width: 0;
}

.editing {
  flex: 1;
  min-width: 0;
}

.go {
  appearance: none;
  flex: 1;
  min-width: 0;
  min-height: var(--touch);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text);
  font: inherit;
  /* (As large as the field the name becomes when it is changed: the words do not jump.) */
  font-size: var(--text-field);
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) {
  .go:hover {
    background: var(--control-hover);
  }
}

.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.at {
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.name {
  flex: 1;
  min-width: 0;
  min-height: var(--touch);
  /* (16px always: Safari on iOS zooms into a field with smaller text.) */
  font-size: var(--text-field);
}

/* (The name being changed starts where it stood: the field's edge is a line wide.) */
.editing .name {
  padding-inline: calc(var(--space-3) - 1px);
}

.add {
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
</style>
