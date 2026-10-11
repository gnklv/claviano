<script setup lang="ts">
import SettingRow from './SettingRow.vue';
import AppButton from './AppButton.vue';
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
  <AppButton class="gear" icon="settings" :label="t('settings')" @click="sheet?.open()" />
  <SheetDialog ref="sheet" :title="t('settings')">
    <!-- Wide screens have the view in the piece's header already. -->
    <SettingRow v-if="piece" class="view" :label="t('viewMode')"><ViewModeSwitch /></SettingRow>
    <SettingRow v-if="piece" :label="t('fingerHints')">
      <SegmentedControl v-model="hints" :options="onOrOff" :label="t('fingerHints')" />
    </SettingRow>
    <SoundSettings />
    <VolumeSettings />
    <SettingRow :label="t('theme')"><ThemeSwitch /></SettingRow>
    <SettingRow :label="t('language')"><LanguageSwitch /></SettingRow>

    <!-- Installing the app: a button where the browser lets the page ask, a word on how where it is done by hand. -->
    <SettingRow v-if="way === 'prompt'" :label="t('app')">
      <AppButton @click="install">{{ t('install') }}</AppButton>
    </SettingRow>
    <SettingRow v-else-if="way === 'ios'" :label="t('app')">
      <span class="how">{{ t('installOnIphone') }}</span>
    </SettingRow>

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
}

.how {
  font-size: var(--text-s);
  text-align: right;
  text-wrap: balance;
}

/*
 * The view is chosen in the piece's header where that has room for it (see the same width in
 * screens/PieceScreen.vue), and here where it has not.
 */
@media (min-width: 901px) {
  .view {
    display: none;
  }
}

.credit {
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.credit a {
  color: inherit;
}
</style>
