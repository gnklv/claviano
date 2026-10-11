<script setup lang="ts">
import ActionTile from '../components/ActionTile.vue';
import AppNotice from '../components/AppNotice.vue';
import SectionHeading from '../components/SectionHeading.vue';
import PieceTile from '../components/PieceTile.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import PieceCard from '../components/PieceCard.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import { useLibrary } from '../composables/useLibrary';
import { usePieceText } from '../composables/usePieceText';
import { demoPieceId } from '../../application/use-cases/Library';
import { useDeps, type Demo } from '../deps';
import { relativeDay } from '../i18n/relativeDay';
import { useI18n } from '../i18n/useI18n';
import { saveFile } from '../saveFile';

/*
 * Where the app starts. On top, what can be begun: opening a file, playing something of one's
 * own. Under that one's pieces (the latest first), once there are any. The demos last, apart and
 * smaller: they show what the player can do, and are nobody's pieces.
 */

const emit = defineEmits<{ file: [file: File]; piece: [id: string]; demo: [demo: Demo]; play: [] }>();

const { playback, openScore, library, demos } = useDeps();
const { t, locale } = useI18n();
const shelf = useLibrary(library);
/** (The day is told as of when the library was come to: it is not a clock.) */
const now = Date.now();

/** Where a piece was left, for its card: "bar 25 of 64"; nothing for one never begun. */
function leftAt(id: string): string | null {
  const memory = shelf.value.memory(id);
  return memory && memory.position > 0 ? t('leftAtBar', { bar: memory.bar, bars: memory.bars }) : null;
}
const noteOf = (...parts: (string | null)[]): string => parts.filter((part) => part !== null).join(' · ');
const { error } = usePieceText(playback, openScore, library, demos);

/** Saves a piece's file out, as it was given. */
async function saveOut(id: string): Promise<void> {
  const file = await library.file(id);
  if (file) saveFile(file.name, file.data);
}

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('file', file);
  // Choosing the same file again must count as a choice.
  input.value = '';
}
</script>

<template>
  <div class="library">
    <ScreenHeader home>
      <template #title>{{ t('appTitle') }}</template>
      <SettingsPanel />
    </ScreenHeader>

    <main class="shelf">
      <AppNotice v-if="error" class="error" alert>{{ error }}</AppNotice>

      <!-- What can be begun here: two actions, apart from the pieces under them. -->
      <div class="actions">
        <!-- (The screen is for opening a piece: that is its main action. A file can be dropped onto the window as well, which the window says when one is held over it.) -->
        <ActionTile tag="label" main icon="plus" :title="t('openMidi')" :note="t('openFormats')">
          <input type="file" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden @change="onFileChosen" />
        </ActionTile>
        <ActionTile icon="note" :title="t('freePlay')" :note="t('freePlayNote')" @click="emit('play')" />
      </div>
      <!-- A private window, or no room: said once, here, so that pieces gone after a reload are no surprise. -->
      <AppNotice v-if="!shelf.keeps" class="unkept">{{ t('shelfUnavailable') }}</AppNotice>

      <template v-if="shelf.pieces.length > 0">
        <SectionHeading>{{ t('myPieces') }}</SectionHeading>
        <div class="cards">
          <PieceCard
            v-for="piece in shelf.pieces"
            :key="piece.id"
            :title="piece.title"
            :note="noteOf(leftAt(piece.id), relativeDay(piece.openedAt, now, locale))"
            @open="emit('piece', piece.id)"
            @rename="library.rename(piece.id, $event)"
            @save="saveOut(piece.id)"
            @remove="library.remove(piece.id)"
          />
        </div>
      </template>

      <SectionHeading>{{ t('demos') }}</SectionHeading>
      <div class="cards demos">
        <PieceTile v-for="demo in demos" :key="demo.id" low :title="t(demo.title)" :note="leftAt(demoPieceId(demo))" @open="emit('demo', demo)" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.library {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
}

.shelf {
  overflow-y: auto;
  padding: var(--space-6) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
}

/* (A column of this width at the most: three tiles across, and a line of words that can be read.) */
.shelf > * {
  max-width: 880px;
  margin-inline: auto;
}

/* The actions: side by side, apart from the pieces under them. */
.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}

.error {
  margin-bottom: var(--space-4);
}

.unkept {
  margin-top: var(--space-3);
}

/* A phone: one column of everything. */
@media (max-width: 599px) {
  .shelf {
    padding-top: var(--space-4);
  }

  .actions,
  .cards {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
}
</style>
