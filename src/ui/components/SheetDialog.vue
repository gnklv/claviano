<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import { useI18n } from '../i18n/useI18n';

/*
 * A panel over the page: it slides in from the right on a wide screen and up from the bottom on a
 * phone. What is in it is the caller's.
 *
 * A <dialog> does the behaviour: it keeps the focus inside, closes on Esc, and dims the page
 * behind (a click there closes it too).
 *
 * It slides in by CSS alone (@starting-style). Sliding out is helped from here: the dialog is
 * closed only once the sheet has slid away. (CSS can hold a closing dialog on screen too, by
 * transitioning `overlay`; Safari has no `overlay`, and a dialog that left the top layer at once
 * slid away under the page, or at the wrong place.)
 */
defineProps<{ title: string }>();

const { t } = useI18n();
const panel = useTemplateRef<HTMLDialogElement>('panel');

const sheet = useTemplateRef<HTMLElement>('sheet');
/** Sliding away: still open, and no longer to be touched. */
const closing = ref(false);

defineExpose({ open: () => panel.value?.showModal() });

function close(): void {
  const dialog = panel.value;
  const moving = sheet.value;
  if (!dialog?.open || !moving || closing.value) return;
  // How long the sheet takes to leave, as the styles say (nothing where there is no motion to wait for).
  const seconds = Number.parseFloat(getComputedStyle(moving).transitionDuration) || 0;
  if (seconds === 0) {
    dialog.close();
    return;
  }
  closing.value = true;
  const done = (event?: Event) => {
    if (event && event.target !== moving) return;
    clearTimeout(timer);
    moving.removeEventListener('transitionend', done);
    closing.value = false;
    dialog.close();
  };
  // (Should the end of the slide never be told: a hidden tab, a style changed half way.)
  const timer = setTimeout(done, seconds * 1000 + 100);
  moving.addEventListener('transitionend', done);
}

/** A click on the dimmed page lands on the dialog itself, not on anything inside it. */
function onClick(event: MouseEvent): void {
  if (event.target === panel.value) close();
}

/** Esc: closed the same way, not at once. */
function onCancel(event: Event): void {
  event.preventDefault();
  close();
}
</script>

<template>
  <dialog ref="panel" class="panel" :class="{ closing }" :aria-label="title" @click="onClick" @cancel="onCancel">
    <div ref="sheet" class="sheet">
      <header class="head">
        <strong>{{ title }}</strong>
        <button class="button close" :title="t('close')" :aria-label="t('close')" @click="close">✕</button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
/*
 * The dialog itself is the dimmed page; the sheet inside it is the panel.
 *
 * Opening: @starting-style is the first frame, and the sheet glides from there. Closing: the
 * `closing` class sends it back, and the dialog closes when it has arrived (see close above).
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

  /* A sheet comes in the way one does on a phone: fast at first, settling slowly; and leaves quicker. */
  --enter: 0.5s;
  --leave: 0.3s;
  --glide: cubic-bezier(0.32, 0.72, 0, 1);
  /* Where the sheet is while out of sight: off the right edge (off the bottom on a phone). */
  --away: 100% 0;
}

.panel::backdrop {
  background: rgb(0 0 0 / 0);
  transition: background var(--leave) ease-out;
}

.panel[open]:not(.closing)::backdrop {
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

.panel[open]:not(.closing) .sheet {
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

  .panel[open]:not(.closing) .sheet {
    opacity: 1;
  }

  @starting-style {
    .panel[open] .sheet {
      opacity: 0;
    }
  }
}
</style>
