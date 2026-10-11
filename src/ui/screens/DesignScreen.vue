<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import MenuList from '../components/MenuList.vue';
import PopOver from '../components/PopOver.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import { ICON_NAMES } from '../icons/icons';

/*
 * The design system on one page, as the showcase is for notation: everything the interface is made
 * of, side by side, to be looked at in both themes. In development only (#/design); its words are
 * for whoever works on the app, and are not translated.
 */
defineEmits<{ back: [] }>();

const panelOpen = ref(false);
const menuOpen = ref(false);
const MENU = [
  { id: 'one', label: 'A choice' },
  { id: 'two', label: 'Another choice' },
  { id: 'gone', label: 'What cannot be undone', danger: true },
];
const chosen = ref('');
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

      <h2 class="heading">Pop-up</h2>
      <p class="about">One pop-up for all: it grows out of its button, and goes on Esc, on a press elsewhere, or when a choice is made.</p>
      <div class="row">
        <PopOver v-model:open="panelOpen" place="above" label="A panel">
          <button class="button" :aria-expanded="panelOpen" @click="panelOpen = !panelOpen">A panel, above</button>
          <template #panel><p class="panel-words">Anything can stand here: the tempo's controls do.</p></template>
        </PopOver>
        <PopOver v-model:open="menuOpen" place="below" role="menu" label="A menu">
          <button class="button" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><AppIcon name="more" />A menu, below</button>
          <template #panel>
            <MenuList
              :items="MENU"
              @choose="
                chosen = $event;
                menuOpen = false;
              "
            />
          </template>
        </PopOver>
        <span class="caption">{{ chosen && `chosen: ${chosen}` }}</span>
      </div>
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

.heading:not(:first-child) {
  margin-top: var(--space-6);
}

.about {
  max-width: 60ch;
  margin: 0 0 var(--space-3);
  color: var(--muted);
}

/* (In the middle: a panel opens over its button or to the left of it, and wants the room.) */
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding-block: var(--space-6);
}

.panel-words {
  width: 220px;
  margin: 0;
  padding: var(--space-4);
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
