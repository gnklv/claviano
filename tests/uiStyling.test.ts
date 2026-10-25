import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A component's look is its own (see "The interface" in docs/rules.md). Where it stands is for what
 * holds it to say: its place in a grid or a row, the room outside it, its width. Anything else a
 * place needs of it, it asks for by name (a prop, a slot). So a style of one component does not
 * reach into another (no :deep), nor name another's insides (its classes), nor set on another more
 * than its place.
 */

const UI = resolve('src/ui');

/** The classes building components give themselves (and their insides), not to be styled from outside. */
const OWN_CLASSES: Record<string, string> = {
  button: 'AppButton',
  toggle: 'ToggleChip',
  words: 'AppButton',
  icon: 'AppIcon',
  option: 'SegmentedControl',
  segmented: 'SegmentedControl',
  'text-field': 'TextField',
  'screen-header': 'ScreenHeader',
  'pop-over': 'PopOver',
  'menu-list': 'MenuList',
  'pass-dots': 'PassDots',
  'piece-tile': 'PieceTile',
  'setting-row': 'SettingRow',
  'section-heading': 'SectionHeading',
  'action-tile': 'ActionTile',
  'tempo-mark': 'TempoMark',
  'panel-control': 'PanelControl',
  'split-handle': 'SplitHandle',
};
/** (A chip or a button whose `words` and `toggle` are its own: their own file names them.) */
const OWNERS = new Set(['AppButton', 'ToggleChip', 'ActionTile', 'PieceTile', 'PanelControl']);

/** What a component's place is: what may be set on it from outside. */
const PLACE = new Set([
  'grid-area', 'grid-column', 'grid-row', 'justify-self', 'align-self', 'order',
  'flex', 'flex-basis', 'flex-grow', 'flex-shrink',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-inline-start', 'margin-inline-end', 'margin-block',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index', 'display', 'visibility',
]);

/** Where a component is held so as to be seen in a state it only has for a moment (the design page's hovered chip). */
const ALLOWED = new Set(['screens/DesignScreen.vue .as-hovered']);

function vues(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return vues(path);
    return name.endsWith('.vue') ? [path] : [];
  });
}

const parts = (file: string) => {
  const source = readFileSync(file, 'utf8');
  const template = source.split('<template>').slice(1).join('<template>').split('<style')[0] ?? '';
  const style = source.includes('<style') ? source.slice(source.indexOf('<style')) : '';
  // Rules as [selector, declarations], comments out, @media unwrapped.
  const rules = [...style.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => [match[1].replace(/^[\s\S]*\{/, '').trim(), match[2]] as const)
    .filter(([selector]) => selector && !selector.startsWith('@'));
  return { template, style, rules };
};

/** The last compound of each selector in a list: what the rule styles. */
const subjects = (selector: string) => selector.split(',').map((each) => each.trim().split(/\s+|>|\+|~/).filter(Boolean).at(-1) ?? '');
const names = (file: string) => file.slice(UI.length + 1);

describe('the look of a component', () => {
  it('is not reached into from outside', () => {
    expect(vues(UI).filter((file) => parts(file).style.includes(':deep(')).map(names)).toEqual([]);
  });

  it('is not styled by the classes of its insides, but in its own file', () => {
    const found = vues(UI).flatMap((file) => {
      const own = basename(file, '.vue');
      return parts(file).rules.flatMap(([selector]) =>
        Object.entries(OWN_CLASSES)
          .filter(([cls, owner]) => owner !== own && !(OWNERS.has(own) && (cls === 'words' || cls === 'icon')) && new RegExp(`\\.${cls}(?![\\w-])`).test(selector))
          .map(([cls]) => `${names(file)}: ${selector} (.${cls} is ${OWN_CLASSES[cls]}'s)`),
      );
    });
    expect(found).toEqual([]);
  });

  it('is given by what holds it no more than its place', () => {
    const found = vues(UI).flatMap((file) => {
      const { template, rules } = parts(file);
      const onComponents = new Set(
        [...template.matchAll(/<([A-Z][A-Za-z]+)\b([^>]*)>/g)].flatMap((match) => [...match[2].matchAll(/(?<![:\w-])class="([^"]+)"/g)].flatMap((cls) => cls[1].split(/\s+/))),
      );
      return rules.flatMap(([selector, body]) => {
        const styled = subjects(selector).flatMap((subject) => [...subject.matchAll(/\.([\w-]+)/g)].map((match) => match[1])).filter((cls) => onComponents.has(cls));
        if (styled.length === 0 || styled.some((cls) => ALLOWED.has(`${names(file)} .${cls}`))) return [];
        const set = body.split(';').map((declaration) => declaration.split(':')[0].trim()).filter(Boolean);
        const beyond = set.filter((property) => !PLACE.has(property));
        return beyond.length ? [`${names(file)}: ${selector} sets ${beyond.join(', ')}`] : [];
      });
    });
    expect(found).toEqual([]);
  });
});
