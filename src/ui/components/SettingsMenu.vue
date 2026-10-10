<script setup lang="ts">
import { useI18n } from '../i18n/useI18n';
import LanguageSwitch from './LanguageSwitch.vue';
import PracticeSettings from './PracticeSettings.vue';
import VolumeSettings from './VolumeSettings.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import ViewModeSwitch from './ViewModeSwitch.vue';

const { t } = useI18n();
const id = 'settings-menu';
</script>

<template>
  <!--
    The browser's Popover API does the menu behaviour for us: the button toggles it,
    a click outside or Esc closes it, and focus and accessibility are handled natively.
  -->
  <div class="settings">
    <button class="button gear" :popovertarget="id" :title="t('settings')" :aria-label="t('settings')">⚙</button>
    <div :id="id" class="menu" popover>
      <!-- Wide screens show these in the header already (see App.vue); the menu keeps the practice settings. -->
      <div class="row display">
        <span class="label">{{ t('viewMode') }}</span>
        <ViewModeSwitch />
      </div>
      <div class="row display">
        <span class="label">{{ t('theme') }}</span>
        <ThemeSwitch />
      </div>
      <div class="row display">
        <span class="label">{{ t('language') }}</span>
        <LanguageSwitch />
      </div>
      <PracticeSettings />
      <VolumeSettings />
      <!-- The samples' licence (CC BY) asks for the author, the licence and what was changed. -->
      <p class="credit">
        {{ t('creditPiano') }}:
        <a href="https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html" target="_blank" rel="noopener">Salamander Grand Piano</a>,
        Alexander Holm,
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>
        ({{ t('creditPianoChanges') }})
      </p>
    </div>
  </div>
</template>

<style scoped>
.gear {
  font-size: 16px;
  line-height: 1;
  padding: 6px 10px;
}

.menu {
  /* Popovers open centred by default; pin it under the header's right corner instead. */
  position: fixed;
  inset: calc(56px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) auto auto;
  margin: 0;
  padding: 12px 14px;
  min-width: 260px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
  gap: 12px;
}

/*
 * Only `display` depends on the open state. Everything else (like `gap`) lives on .menu itself,
 * so the layout stays intact while the menu fades out after closing.
 */
.menu:popover-open {
  display: grid;
}

/*
 * Fade in while sliding down a little. @starting-style is the first frame of opening;
 * allow-discrete lets the browser finish fading out before hiding the menu (display/overlay).
 * Browsers without these features just show and hide it instantly.
 */
.menu {
  transition:
    opacity 0.15s ease-out,
    translate 0.15s ease-out,
    display 0.15s allow-discrete,
    overlay 0.15s allow-discrete;
}

.menu:not(:popover-open) {
  opacity: 0;
  translate: 0 -4px;
}

@starting-style {
  .menu:popover-open {
    opacity: 0;
    translate: 0 -4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu {
    transition: none;
  }
}

@media (min-width: 901px) {
  .row.display {
    display: none;
  }
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

.credit {
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  max-width: 260px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.credit a {
  color: inherit;
}
</style>
