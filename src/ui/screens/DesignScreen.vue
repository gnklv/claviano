<script setup lang="ts">
import { ref } from 'vue';
import ActionTile from '../components/ActionTile.vue';
import AppButton from '../components/AppButton.vue';
import AppIcon from '../components/AppIcon.vue';
import AppNotice from '../components/AppNotice.vue';
import AppSlider from '../components/AppSlider.vue';
import FingerBar from '../components/FingerBar.vue';
import MenuList from '../components/MenuList.vue';
import PanelControl from '../components/PanelControl.vue';
import PieceCard from '../components/PieceCard.vue';
import PieceTile from '../components/PieceTile.vue';
import PopOver from '../components/PopOver.vue';
import ScreenHeader from '../components/ScreenHeader.vue';
import SectionHeading from '../components/SectionHeading.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import SettingRow from '../components/SettingRow.vue';
import SheetDialog from '../components/SheetDialog.vue';
import TempoMark from '../components/TempoMark.vue';
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
/** The finger last chosen in the bar of fingers (it sets nothing here). */
const finger = ref('');
</script>

<template>
  <div class="page">
    <ScreenHeader back @back="$emit('back')">
      <template #title>Design</template>
      <ThemeSwitch />
    </ScreenHeader>
    <main class="content">
      <SectionHeading>Colours</SectionHeading>
      <ul class="swatches">
        <li v-for="colour in COLOURS" :key="colour.token" class="swatch">
          <span class="chip" :style="{ background: `var(${colour.token})` }" />
          <span>
            <code>{{ colour.token }}</code>
            <span class="caption">{{ colour.use }}</span>
          </span>
        </li>
      </ul>

      <SectionHeading>Type</SectionHeading>
      <p class="about">Titles in the serif, as the words in sheet music are; everything else in the system's own face. Five sizes.</p>
      <p class="title-sample">La Valse d’Amélie · Ода к радости</p>
      <ul class="sizes-list">
        <li v-for="size in SIZES" :key="size" :style="{ fontSize: `var(${size})` }">
          Сыграть что-то своё <code class="caption">{{ size }}</code>
        </li>
      </ul>
      <p class="about">A tempo written as in the music: its note in the music font, as on the staff.</p>
      <p><TempoMark unit="quarter" :dotted="false" :per-minute="90" /> · <TempoMark unit="eighth" :dotted="true" :per-minute="60" /></p>

      <SectionHeading>Buttons</SectionHeading>
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

      <SectionHeading>Chips</SectionHeading>
      <p class="about">On or off: what is switched while playing, or one of a few values.</p>
      <div class="row start">
        <ToggleChip v-model:pressed="chipOn">On</ToggleChip>
        <ToggleChip v-model:pressed="chipOff">Off</ToggleChip>
        <ToggleChip v-model:pressed="chipOn" icon="loop">With an icon</ToggleChip>
        <ToggleChip :pressed="false" disabled>Disabled</ToggleChip>
      </div>

      <SectionHeading>Segments</SectionHeading>
      <p class="about">One of a few, all in sight: a view, a theme, a time signature.</p>
      <div class="row start">
        <SegmentedControl v-model="view" :options="VIEWS" label="An example" />
        <ThemeSwitch />
        <SegmentedControl v-model="view" :options="VIEWS" label="Held as it is" disabled />
      </div>

      <SectionHeading>Slider</SectionHeading>
      <div class="row start">
        <AppSlider v-model="level" class="slider" label="An example" />
        <AppSlider :model-value="30" class="slider" label="Disabled" disabled />
        <span class="caption">{{ level }}%</span>
      </div>

      <SectionHeading>Field</SectionHeading>
      <div class="row start">
        <TextField v-model="name" class="name-field" label="A name" />
        <TextField v-model="bar" class="number-field" type="number" label="A number" />
      </div>

      <SectionHeading>Action</SectionHeading>
      <p class="about">What a screen starts from: a few, larger than buttons. One of them is the main one.</p>
      <div class="actions">
        <ActionTile main icon="plus" title="The main action" note="A word about it" />
        <ActionTile icon="note" title="Another" note="A word about it too" />
      </div>

      <SectionHeading>Notice</SectionHeading>
      <div class="notices">
        <AppNotice>How things stand, said quietly.</AppNotice>
        <AppNotice alert>Something went wrong: the file "photo.jpg" is not supported.</AppNotice>
      </div>

      <SectionHeading>Tile</SectionHeading>
      <p class="about">A piece on a shelf. What else can be done with it stands over its corner.</p>
      <div class="tiles">
        <PieceTile title="Ода к радости" note="такт 3 из 8" />
        <PieceTile title="A title long enough to take two lines, and to be cut after them, as a long one is" note="yesterday">
          <AppButton class="corner" variant="quiet" icon="more" label="More" />
        </PieceTile>
        <PieceTile title="Without a note" />
        <PieceTile low title="A low one" note="for what is nobody's" />
      </div>
      <p class="about">On the shelf: a press opens the piece; behind its menu, renaming it, saving its file, taking it off (asked twice).</p>
      <div class="tiles">
        <PieceCard title="La Valse d’Amélie" note="bar 12 of 64" />
      </div>

      <SectionHeading>Pop-up</SectionHeading>
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
      <p class="about">A button in a bar with what it sets behind it: a panel over it, a sheet on a phone (the tempo, the bookmarks). Quiet, it reads as what it says.</p>
      <div class="row">
        <PanelControl title="Tempo" label="Tempo: 80%">80%<template #panel><p class="panel-words">What the button sets stands here.</p></template></PanelControl>
        <PanelControl title="Bookmarks" label="Bar 12 / 64 · Bookmarks" variant="quiet" icon="bookmark">Bar 12 / 64<template #panel><p class="panel-words">The piece’s bookmarks stand here.</p></template></PanelControl>
      </div>

      <SectionHeading>The bar of fingers</SectionHeading>
      <p class="about">In place of the transport while one's own fingers are set: first a word on what to do, then the note picked and a finger for it.</p>
      <div class="bars">
        <FingerBar :page="null" :picked="null" />
        <FingerBar :page="null" :picked="{ beat: 0, pitch: 64, hand: 'right' }" @set="finger = $event === null ? 'none' : String($event)" />
      </div>
      <span class="caption">{{ finger && `set: ${finger}` }}</span>

      <SectionHeading>A row of settings</SectionHeading>
      <p class="about">What is set, and the control that sets it. Sheets are made of these.</p>
      <div class="rows">
        <SettingRow label="A choice"><SegmentedControl v-model="view" :options="VIEWS" label="A choice" /></SettingRow>
        <SettingRow tag="label" label="A level">
          <AppSlider v-model="level" class="slider" />
        </SettingRow>
      </div>

      <SectionHeading>Sheet</SectionHeading>
      <p class="about">What is set once in a while: from the side on a wide screen, from below on a phone.</p>
      <div class="row start">
        <AppButton @click="sheet?.open()">Open a sheet</AppButton>
        <SheetDialog ref="sheet" title="A sheet">
          <SettingRow label="A choice"><SegmentedControl v-model="view" :options="VIEWS" label="A choice" /></SettingRow>
          <SettingRow tag="label" label="A level">
            <AppSlider v-model="level" class="slider" />
          </SettingRow>
        </SheetDialog>
      </div>

      <SectionHeading>Icons</SectionHeading>
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

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  max-width: 640px;
}

.bars {
  display: grid;
  gap: var(--space-3);
}

.rows {
  display: grid;
  gap: var(--space-4);
  max-width: 340px;
}

.notices {
  display: grid;
  gap: var(--space-3);
  max-width: 640px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
  /* (Each at its own height: the low one is to be seen as low.) */
  align-items: start;
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
