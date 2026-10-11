<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { useFingerHints } from '../composables/useFingerHints';
import { useI18n } from '../i18n/useI18n';
import { useInstall } from '../install/useInstall';
import LanguageSwitch from './LanguageSwitch.vue';
import SegmentedControl from './SegmentedControl.vue';
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
const { way, install } = useInstall();

// Fingers offered where the notes give none: off unless asked for.
const fingerHints = useFingerHints();
const hints = computed<'off' | 'on'>({ get: () => (fingerHints.value ? 'on' : 'off'), set: (value) => (fingerHints.value = value === 'on') });
const onOrOff = computed(() => [
  { value: 'off' as const, label: t('off') },
  { value: 'on' as const, label: t('on') },
]);
</script>

<template>
  <button class="button gear" :title="t('settings')" :aria-label="t('settings')" @click="sheet?.open()">⚙&#xFE0E;</button>
  <SheetDialog ref="sheet" :title="t('settings')">
    <!-- Wide screens have the view in the piece's header already. -->
    <div v-if="piece" class="row view">
      <span class="label">{{ t('viewMode') }}</span>
      <ViewModeSwitch />
    </div>
    <div v-if="piece" class="row">
      <span class="label">{{ t('fingerHints') }}</span>
      <SegmentedControl v-model="hints" :options="onOrOff" :label="t('fingerHints')" />
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

    <!-- Installing the app: a button where the browser lets the page ask, a word on how where it is done by hand. -->
    <div v-if="way === 'prompt'" class="row">
      <span class="label">{{ t('app') }}</span>
      <button class="button" @click="install">{{ t('install') }}</button>
    </div>
    <div v-else-if="way === 'ios'" class="row install-by-hand">
      <span class="label">{{ t('app') }}</span>
      <span class="how">{{ t('installOnIphone') }}</span>
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
  /* (The glyph is small for its size.) */
  font-size: 20px;
  line-height: 1;
  padding: 4px 9px;
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

.how {
  font-size: 13px;
  text-align: right;
  text-wrap: balance;
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
