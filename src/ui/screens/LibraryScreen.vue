<script setup lang="ts">
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
 * Where the app starts. One's own pieces first: a file to open, and the pieces opened before (the
 * latest first). The demos under them, apart and smaller: they show what the player can do, and
 * are nobody's pieces.
 */

const emit = defineEmits<{ file: [file: File]; piece: [id: string]; demo: [demo: Demo] }>();

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
    <header class="bar">
      <strong class="logo">{{ t('appTitle') }}</strong>
      <div class="settings">
        <SettingsPanel />
      </div>
    </header>

    <main class="shelf">
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <h2 class="heading">{{ t('myPieces') }}</h2>
      <div class="cards">
        <label class="card open">
          <span class="name">{{ t('openMidi') }}</span>
          <span class="note">{{ t('openFormats') }}</span>
          <input type="file" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden @change="onFileChosen" />
        </label>
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
      <p class="hint">{{ t('libraryHint') }}</p>
      <!-- A private window, or no room: said once, here, so that pieces gone after a reload are no surprise. -->
      <p v-if="!shelf.keeps" class="unkept" role="status">{{ t('shelfUnavailable') }}</p>

      <h2 class="heading">{{ t('demos') }}</h2>
      <div class="cards demos">
        <button v-for="demo in demos" :key="demo.id" class="card" @click="emit('demo', demo)">
          <span class="name">{{ t(demo.title) }}</span>
          <span v-if="leftAt(demoPieceId(demo))" class="note">{{ leftAt(demoPieceId(demo)) }}</span>
        </button>
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

.bar {
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 16px;
  letter-spacing: 0.02em;
}

.settings {
  display: inline-flex;
  align-items: center;
  gap: 8px 16px;
  margin-left: auto;
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
  margin-block: 0 12px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.unkept {
  margin-top: 12px;
  margin-bottom: 0;
  font-size: 13px;
}

/* (After one's own pieces and what is said under them: a section apart.) */
.hint ~ .heading {
  margin-top: 40px;
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

.card {
  appearance: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  min-height: 120px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card:hover,
.card:focus-within {
  background: var(--control-hover);
}

/* Opening a file is an action, not a piece: an outline rather than a filled card. */
.card.open {
  border-style: dashed;
  border-color: var(--accent);
  background: transparent;
}

.card.open:hover,
.card.open:focus-within {
  background: var(--drop-overlay);
}

.name {
  font-size: 16px;
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
  font-size: 13px;
}

.error {
  margin-top: 0;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--left);
  border-radius: 8px;
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

  .card {
    min-height: 72px;
  }
}
</style>
