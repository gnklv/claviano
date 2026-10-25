<script setup lang="ts">
import SettingRow from '../components/SettingRow.vue';
import AppButton from '../components/AppButton.vue';
import { computed, useTemplateRef } from 'vue';
import { useFingerHints } from '../kept/useFingerHints';
import { useI18n } from '../i18n/useI18n';
import { useInstall } from '../browser/useInstall';
import LanguageSwitch from '../components/LanguageSwitch.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import SheetDialog from '../components/SheetDialog.vue';
import SoundSettings from './SoundSettings.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import ViewModeSwitch from '../components/ViewModeSwitch.vue';
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
    <!-- The view stands in the piece's header, but on a phone: there, it is chosen here. -->
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
 * The view stands in the piece's header, but on a phone: there, it is chosen here (the same width
 * is in screens/PieceScreen.vue).
 */
@media (min-width: 600px) {
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
