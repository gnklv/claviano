<script setup lang="ts">
import LanguageSwitch from '../components/LanguageSwitch.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import { usePieceText } from '../composables/usePieceText';
import { useDeps, type Demo } from '../deps';
import { useI18n } from '../i18n/useI18n';

/*
 * Where the app starts: a file of one's own to open, and the demos. (The pieces opened before
 * will stand here too, once the library remembers them.)
 */

const emit = defineEmits<{ file: [file: File]; demo: [demo: Demo] }>();

const { playback, openScore, demos } = useDeps();
const { t } = useI18n();
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
        <ThemeSwitch />
        <LanguageSwitch />
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
        <button v-for="demo in demos" :key="demo.id" class="card" @click="emit('demo', demo)">
          <span class="name">{{ t(demo.title) }}</span>
          <span class="note">{{ t('demo') }}</span>
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
