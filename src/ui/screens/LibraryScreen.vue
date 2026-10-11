<script setup lang="ts">
import SettingsPanel from '../components/SettingsPanel.vue';
import { useLibrary } from '../composables/useLibrary';
import { usePieceText } from '../composables/usePieceText';
import { demoPieceId } from '../../application/use-cases/Library';
import { useDeps, type Demo } from '../deps';
import { relativeDay } from '../i18n/relativeDay';
import { useI18n } from '../i18n/useI18n';

/*
 * Where the app starts: a file of one's own to open, the pieces opened before (the latest first),
 * and the demos.
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
const { error } = usePieceText(playback, openScore, demos);

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

      <div class="cards">
        <label class="card open">
          <span class="name">{{ t('openMidi') }}</span>
          <span class="note">{{ t('openFormats') }}</span>
          <input type="file" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden @change="onFileChosen" />
        </label>
        <button v-for="piece in shelf.pieces" :key="piece.id" class="card" @click="emit('piece', piece.id)">
          <span class="name">{{ piece.title }}</span>
          <span class="note">{{ noteOf(leftAt(piece.id), relativeDay(piece.openedAt, now, locale)) }}</span>
        </button>
        <button v-for="demo in demos" :key="demo.id" class="card" @click="emit('demo', demo)">
          <span class="name">{{ t(demo.title) }}</span>
          <span class="note">{{ noteOf(t('demo'), leftAt(demoPieceId(demo))) }}</span>
        </button>
      </div>

      <p class="hint">{{ t('libraryHint') }}</p>
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
  margin-top: 24px;
  color: var(--muted);
  text-align: center;
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
