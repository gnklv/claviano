<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { useI18n } from '../i18n/useI18n';
import LanguageSwitch from './LanguageSwitch.vue';
import SoundSettings from './SoundSettings.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import ViewModeSwitch from './ViewModeSwitch.vue';
import VolumeSettings from './VolumeSettings.vue';

/*
 * What is seldom changed: the sound and how loud it is, the theme, the language. A panel that
 * slides in from the right on a wide screen and up from the bottom on a phone, over any screen.
 *
 * A <dialog> does the behaviour: it keeps the focus inside, closes on Esc, and dims the page
 * behind (a click there closes it too).
 */

/** `piece`: on the piece's screen, where the view has a meaning. */
defineProps<{ piece?: boolean }>();

const { t } = useI18n();
const panel = useTemplateRef<HTMLDialogElement>('panel');

/** A click on the dimmed page lands on the dialog itself, not on anything inside it. */
function onClick(event: MouseEvent): void {
  if (event.target === panel.value) panel.value?.close();
}
</script>

<template>
  <button class="button gear" :title="t('settings')" :aria-label="t('settings')" @click="panel?.showModal()">⚙</button>
  <dialog ref="panel" class="panel" :aria-label="t('settings')" @click="onClick">
    <div class="sheet">
      <header class="head">
        <strong>{{ t('settings') }}</strong>
        <button class="button close" :title="t('close')" :aria-label="t('close')" @click="panel?.close()">✕</button>
      </header>

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
    </div>
  </dialog>
</template>

<style scoped>
.gear {
  flex: none;
  font-size: 16px;
  line-height: 1;
  padding: 6px 10px;
}

/*
 * The dialog itself is the dimmed page; the sheet inside it is the panel.
 *
 * Opening and closing are both animated, in CSS alone: `display` and `overlay` are transitioned
 * with allow-discrete, so a closing dialog stays shown (and on top) until its sheet has slid
 * away; @starting-style is the first frame of opening. A browser without these shows and hides
 * the panel at once.
 */
.panel {
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  /*
   * The sheet starts outside the dialog and slides in: nothing to scroll to out there. Clipped, not
   * hidden: a hidden box still scrolls to the button that takes the focus on opening, while it is
   * out there, and the sheet then seems to drive past its place and come back.
   */
  overflow: clip;
  background: transparent;
  color: var(--text);
  transition:
    display var(--leave) allow-discrete,
    overlay var(--leave) allow-discrete;

  /* A sheet comes in the way one does on a phone: fast at first, settling slowly; and leaves quicker. */
  --enter: 0.5s;
  --leave: 0.3s;
  --glide: cubic-bezier(0.32, 0.72, 0, 1);
  /* Where the sheet is while out of sight: off the right edge (off the bottom on a phone). */
  --away: 100% 0;
}

.panel::backdrop {
  background: rgb(0 0 0 / 0);
  transition:
    background var(--leave) ease-out,
    display var(--leave) allow-discrete,
    overlay var(--leave) allow-discrete;
}

.panel[open]::backdrop {
  background: rgb(0 0 0 / 0.4);
  transition-duration: var(--enter);
}

.sheet {
  position: absolute;
  inset: 0 0 0 auto;
  box-sizing: border-box;
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(340px, 100%);
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) 16px;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--panel);
  box-shadow: -12px 0 32px rgb(0 0 0 / 0.25);
  /* Closed (and closing): away. */
  translate: var(--away);
  transition: translate var(--leave) var(--glide);
}

.panel[open] .sheet {
  translate: 0 0;
  transition-duration: var(--enter);
}

@starting-style {
  .panel[open] .sheet {
    translate: var(--away);
  }

  .panel[open]::backdrop {
    background: rgb(0 0 0 / 0);
  }
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
}

.close {
  padding: 4px 9px;
  line-height: 1;
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

/* A phone: the panel comes up from the bottom, as tall as it needs, no taller than most of the screen. */
@media (max-width: 600px) {
  .panel {
    --away: 0 100%;
  }

  .sheet {
    inset: auto 0 0 0;
    width: 100%;
    max-height: 85%;
    padding: 14px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    border-left: 0;
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -12px 32px rgb(0 0 0 / 0.25);
  }
}

/* No sliding for those who asked for less motion: the panel and the dimming fade quickly instead. */
@media (prefers-reduced-motion: reduce) {
  .panel {
    --enter: 0.15s;
    --leave: 0.15s;
    --away: 0 0;
  }

  .sheet {
    opacity: 0;
    transition: opacity var(--leave) ease-out;
  }

  .panel[open] .sheet {
    opacity: 1;
  }

  @starting-style {
    .panel[open] .sheet {
      opacity: 0;
    }
  }
}
</style>
