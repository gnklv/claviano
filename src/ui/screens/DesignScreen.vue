<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import { ICON_NAMES } from '../icons/icons';

/*
 * The design system on one page, as the showcase is for notation: everything the interface is made
 * of, side by side, to be looked at in both themes. In development only (#/design); its words are
 * for whoever works on the app, and are not translated.
 */
defineEmits<{ back: [] }>();
</script>

<template>
  <div class="page">
    <header class="top">
      <button class="button back" aria-label="Back" @click="$emit('back')"><AppIcon name="back" /></button>
      <strong class="title">Design</strong>
      <ThemeSwitch />
    </header>
    <main class="content">
      <h2 class="heading">Icons</h2>
      <ul class="icons">
        <li v-for="name in ICON_NAMES" :key="name" class="sample">
          <span class="sizes">
            <AppIcon :name="name" />
            <AppIcon :name="name" small />
            <button class="button" :aria-label="name"><AppIcon :name="name" /></button>
            <button class="button primary" :aria-label="name"><AppIcon :name="name" /></button>
          </span>
          <span class="caption">{{ name }}</span>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.title {
  flex: 1;
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  font-size: var(--text-l);
}

.back,
.sizes .button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5) var(--space-4);
}

.heading {
  margin-bottom: var(--space-3);
  color: var(--muted);
  font-size: var(--text-s);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sample {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.sizes {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.caption {
  color: var(--muted);
  font-size: var(--text-xs);
}
</style>
