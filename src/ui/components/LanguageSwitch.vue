<script setup lang="ts">
import { useI18n } from '../i18n/useI18n';

const { locale, locales, t } = useI18n();
</script>

<template>
  <div class="switch" role="group" :aria-label="t('language')">
    <button
      v-for="option in locales"
      :key="option"
      class="option"
      :class="{ active: option === locale }"
      :aria-pressed="option === locale"
      @click="locale = option"
    >
      {{ option.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.switch {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.option {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
}

.option.active {
  background: #252933;
  color: var(--text);
}
</style>
