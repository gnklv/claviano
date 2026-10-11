<script setup lang="ts">
import PieceTile from '../components/PieceTile.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import AppIcon from '../components/AppIcon.vue';
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
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- What can be begun here: two actions, apart from the pieces under them. -->
      <div class="actions">
        <label class="action">
          <span class="sign"><AppIcon name="plus" /></span>
          <span class="words">
            <span class="name">{{ t('openMidi') }}</span>
            <span class="note">{{ t('openFormats') }}</span>
          </span>
          <input type="file" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden @change="onFileChosen" />
        </label>
        <button class="action" @click="emit('play')">
          <span class="sign"><AppIcon name="note" /></span>
          <span class="words">
            <span class="name">{{ t('freePlay') }}</span>
            <span class="note">{{ t('freePlayNote') }}</span>
          </span>
        </button>
      </div>
      <p class="hint">{{ t('libraryHint') }}</p>
      <!-- A private window, or no room: said once, here, so that pieces gone after a reload are no surprise. -->
      <p v-if="!shelf.keeps" class="unkept" role="status">{{ t('shelfUnavailable') }}</p>

      <template v-if="shelf.pieces.length > 0">
        <h2 class="heading">{{ t('myPieces') }}</h2>
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

      <h2 class="heading">{{ t('demos') }}</h2>
      <div class="cards demos">
        <PieceTile v-for="demo in demos" :key="demo.id" :title="t(demo.title)" :note="leftAt(demoPieceId(demo))" @open="emit('demo', demo)" />
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
  padding: 32px max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}

.shelf > * {
  max-width: 880px;
  margin-inline: auto;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.heading {
  margin-bottom: 12px;
  color: var(--muted);
  font-size: var(--text-s);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.unkept {
  margin-top: 12px;
  margin-bottom: 0;
  font-size: var(--text-s);
}

/* Each section stands apart from what is over it. */
.heading {
  margin-top: 36px;
}

/* The actions: side by side, a row of two, each a sign and what it does. Not cards: nothing here is a piece. */
.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px dashed var(--accent);
  border-radius: var(--radius-m);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.action:hover,
.action:focus-within {
  background: var(--drop-overlay);
}

.sign {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
}

.words {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.action .name,
.action .note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Under a finger there is nothing to drag a file with: the hint keeps its room, and says nothing. */
@media (pointer: coarse) {
  .hint {
    visibility: hidden;
    height: 0;
  }
}

/* The demos: lower, the name beside what is remembered of it. */
.demos .card {
  min-height: 0;
  padding-block: 12px;
}

.name {
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

.hint {
  margin-top: 12px;
  margin-bottom: 0;
  color: var(--muted);
  font-size: var(--text-s);
}

.error {
  margin-top: 0;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--left);
  border-radius: var(--radius-m);
}

/* A phone: one column, lower cards. */
@media (max-width: 520px) {
  .shelf {
    padding-top: 16px;
  }

  .cards {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  /* The actions: one under the other, their words in full. */
  .actions {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .action {
    padding-block: 10px;
  }
}
</style>
