<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { useI18n } from '../i18n/useI18n';
import LanguageSwitch from './LanguageSwitch.vue';
import SheetDialog from './SheetDialog.vue';
import SoundSettings from './SoundSettings.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import ViewModeSwitch from './ViewModeSwitch.vue';
import VolumeSettings from './VolumeSettings.vue';

/* What is seldom changed: the sound and how loud it is, the theme, the language. A panel over any screen. */

/** `piece`: on the piece's screen, where the view has a meaning. */
defineProps<{ piece?: boolean }>();

const { t } = useI18n();
const sheet = useTemplateRef('sheet');
</script>

<template>
  <button class="button gear" :title="t('settings')" :aria-label="t('settings')" @click="sheet?.open()">⚙</button>
  <SheetDialog ref="sheet" :title="t('settings')">
    <!-- Wide screens have the view in the piece's header already. -->
    <div v-if="piece" class="row view">
      <span class="label">{{ t('viewMode') }}</span>
      <ViewModeSwitch />
    </div>
    <SoundSettings />
    <VolumeSettings />
    <div class="row">
      <span class="label">{{ t('theme') }}</span>
      <ThemeSwitch />
    </div>
    <div class="row">
      <span class="label">{{ t('language') }}</span>
      <LanguageSwitch />
    </div>

    <!-- The samples' licence (CC BY) asks for the author, the licence and what was changed. -->
    <p class="credit">
      {{ t('creditPiano') }}:
      <a href="https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html" target="_blank" rel="noopener">Salamander Grand Piano</a>,
      Alexander Holm,
      <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>
      ({{ t('creditPianoChanges') }})
    </p>
  </SheetDialog>
</template>

<style scoped>
.gear {
  flex: none;
  font-size: 16px;
  line-height: 1;
  padding: 6px 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.label {
  color: var(--muted);
}

/* The view switch is in the header on a wide screen: here only where the header has no room for it. */
@media (min-width: 901px) {
  .row.view {
    display: none;
  }
}

.credit {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.credit a {
  color: inherit;
}

</style>
