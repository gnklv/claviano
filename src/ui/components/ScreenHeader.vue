<script setup lang="ts">
import { useI18n } from '../i18n/useI18n';
import AppButton from './AppButton.vue';

/*
 * The strip on top of a screen: the way back (where there is one), what the screen is, and on the
 * right what is set there. One row, whatever the width: the title gives way, never the buttons.
 *
 * `title` is the title's slot; the default slot is what stands on the right.
 */
defineProps<{
  /** There is a screen to go back to. */
  back?: boolean;
  /** The app's own name, on its first screen: in ink, not muted as the name of a place is. */
  home?: boolean;
  /** The title is word of something gone wrong: said aloud by a screen reader. */
  alert?: boolean;
}>();
defineEmits<{ back: [] }>();

const { t } = useI18n();
</script>

<template>
  <header class="screen-header">
    <AppButton v-if="back" class="back" icon="back" :label="t('backToLibrary')" @click="$emit('back')" />
    <span class="title" :class="{ home, alert }" :role="alert ? 'alert' : undefined"><slot name="title" /></span>
    <slot />
  </header>
</template>

<style scoped>
.screen-header {
  display: flex;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  /* Keep clear of the notch and rounded corners (viewport-fit=cover in index.html). */
  padding: max(var(--space-2), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) var(--space-2) max(var(--space-4), env(safe-area-inset-left));
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.back {
  flex: none;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title.home {
  color: var(--text);
  font-size: var(--text-l);
}

.title.alert {
  color: var(--text);
}
</style>
