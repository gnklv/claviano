<script setup lang="ts">
import { ref } from 'vue';
import AppButton from '../components/AppButton.vue';
import AppIcon from '../components/AppIcon.vue';
import MenuList from '../components/MenuList.vue';
import PieceTile from '../components/PieceTile.vue';
import PopOver from '../components/PopOver.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import SheetDialog from '../components/SheetDialog.vue';
import TextField from '../components/TextField.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import ToggleChip from '../components/ToggleChip.vue';
import { ICON_NAMES } from '../icons/icons';

/*
 * The design system on one page, as the showcase is for notation: everything the interface is made
 * of, side by side, to be looked at in both themes. In development only (#/design); its words are
 * for whoever works on the app, and are not translated.
 */
defineEmits<{ back: [] }>();

/** The colours, by what they are for. */
const COLOURS = [
  { token: '--bg', use: 'the page' },
  { token: '--panel', use: 'what lies on the page' },
  { token: '--control', use: 'what is pressed' },
  { token: '--border', use: 'edges' },
  { token: '--text', use: 'ink' },
  { token: '--muted', use: 'ink, said quietly' },
  { token: '--accent', use: 'the one main action; danger; recording' },
  { token: '--right', use: 'the right hand, and nothing else' },
  { token: '--left', use: 'the left hand, and nothing else' },
];
const SIZES = ['--text-xs', '--text-s', '--text-m', '--text-l', '--text-xl'];

const chipOn = ref(true);
const chipOff = ref(false);
const VIEWS = [
  { value: 'one' as const, label: 'One' },
  { value: 'two' as const, label: 'Two' },
  { value: 'three' as const, label: 'Three' },
];
const view = ref<'one' | 'two' | 'three'>('two');
const level = ref(60);
const name = ref('La Valse d’Amélie');
const bar = ref(12);
const sheet = ref<InstanceType<typeof SheetDialog> | null>(null);

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
    <ScreenHeader back @back="$emit('back')">
      <template #title>Design</template>
      <ThemeSwitch />
    </ScreenHeader>
    <main class="content">
      <h2 class="heading">Colours</h2>
      <ul class="swatches">
        <li v-for="colour in COLOURS" :key="colour.token" class="swatch">
          <span class="chip" :style="{ background: `var(${colour.token})` }" />
          <span>
            <code>{{ colour.token }}</code>
            <span class="caption">{{ colour.use }}</span>
          </span>
        </li>
      </ul>

      <h2 class="heading">Type</h2>
      <p class="about">Titles in the serif, as the words in sheet music are; everything else in the system's own face. Five sizes.</p>
      <p class="title-sample">La Valse d’Amélie · Ода к радости</p>
      <ul class="sizes-list">
        <li v-for="size in SIZES" :key="size" :style="{ fontSize: `var(${size})` }">
          Сыграть что-то своё <code class="caption">{{ size }}</code>
        </li>
      </ul>

      <h2 class="heading">Buttons</h2>
      <p class="about">One primary button on a screen: its main action. A quiet one stands over something else. An icon alone carries a name for a screen reader.</p>
      <div class="row start">
        <AppButton>Words</AppButton>
        <AppButton icon="record">An icon and words</AppButton>
        <AppButton icon="settings" label="An icon alone" />
        <AppButton variant="primary" icon="play" label="Primary" />
        <AppButton variant="primary">Keep</AppButton>
        <AppButton variant="quiet" icon="more" label="Quiet" />
        <AppButton disabled>Disabled</AppButton>
      </div>

      <h2 class="heading">Chips</h2>
      <p class="about">On or off: what is switched while playing, or one of a few values.</p>
      <div class="row start">
        <ToggleChip v-model:pressed="chipOn">On</ToggleChip>
        <ToggleChip v-model:pressed="chipOff">Off</ToggleChip>
        <ToggleChip v-model:pressed="chipOn" icon="loop">With an icon</ToggleChip>
        <ToggleChip :pressed="false" disabled>Disabled</ToggleChip>
      </div>

      <h2 class="heading">Segments</h2>
      <p class="about">One of a few, all in sight: a view, a theme, a time signature.</p>
      <div class="row start">
        <SegmentedControl v-model="view" :options="VIEWS" label="An example" />
        <ThemeSwitch />
      </div>

      <h2 class="heading">Slider</h2>
      <div class="row start">
        <input v-model.number="level" class="slider" type="range" min="0" max="100" aria-label="An example" :style="{ '--fill': `${level}%` }" />
        <input class="slider" type="range" min="0" max="100" value="30" disabled aria-label="Disabled" style="--fill: 30%" />
        <span class="caption">{{ level }}%</span>
      </div>

      <h2 class="heading">Field</h2>
      <div class="row start">
        <TextField v-model="name" class="name-field" label="A name" />
        <TextField v-model="bar" class="number-field" type="number" label="A number" />
      </div>

      <h2 class="heading">Tile</h2>
      <p class="about">A piece on a shelf. What else can be done with it stands over its corner.</p>
      <div class="tiles">
        <PieceTile title="Ода к радости" note="такт 3 из 8" />
        <PieceTile title="A title long enough to take two lines, and to be cut after them, as a long one is" note="yesterday">
          <AppButton class="corner" variant="quiet" icon="more" label="More" />
        </PieceTile>
        <PieceTile title="Without a note" />
      </div>

      <h2 class="heading">Pop-up</h2>
      <p class="about">One pop-up for all: it grows out of its button, and goes on Esc, on a press elsewhere, or when a choice is made.</p>
      <div class="row">
        <PopOver v-model:open="panelOpen" place="above" label="A panel">
          <AppButton :aria-expanded="panelOpen" @click="panelOpen = !panelOpen">A panel, above</AppButton>
          <template #panel><p class="panel-words">Anything can stand here: the tempo's controls do.</p></template>
        </PopOver>
        <PopOver v-model:open="menuOpen" place="below" role="menu" label="A menu">
          <AppButton icon="more" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">A menu, below</AppButton>
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

      <h2 class="heading">Sheet</h2>
      <p class="about">What is set once in a while: from the side on a wide screen, from below on a phone.</p>
      <div class="row start">
        <AppButton @click="sheet?.open()">Open a sheet</AppButton>
        <SheetDialog ref="sheet" title="A sheet">
          <p class="about">Rows of settings stand here.</p>
        </SheetDialog>
      </div>

      <h2 class="heading">Icons</h2>
      <ul class="icons">
        <li v-for="icon in ICON_NAMES" :key="icon" class="sample">
          <span class="sizes">
            <AppIcon :name="icon" />
            <AppIcon :name="icon" small />
            <AppButton :icon="icon" :label="icon" />
            <AppButton variant="primary" :icon="icon" :label="icon" />
          </span>
          <span class="caption">{{ icon }}</span>
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

.row.start {
  justify-content: flex-start;
  gap: var(--space-3);
  padding-block: 0;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.swatch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.swatch .chip {
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
}

.swatch .caption {
  display: block;
}

.title-sample {
  margin: 0 0 var(--space-3);
  font-family: var(--font-title);
  font-weight: var(--title-weight);
  font-size: var(--text-xl);
}

.sizes-list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.slider {
  width: 200px;
}

.name-field {
  width: 240px;
}

.number-field {
  width: 4em;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}

.corner {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  padding: 2px var(--space-2);
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
