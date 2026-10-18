import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The interface's two kinds of component, told apart by where they stand (see "The interface" in
 * docs/rules.md). A building component (ui/components) does not reach the app: no useDeps, itself or
 * through what it imports; it stands on the design page. A part of a screen (ui/parts) reaches the
 * app, and does not.
 */

const UI = resolve('src/ui');
const DESIGN_PAGE = join(UI, 'screens/DesignScreen.vue');

const source = (file: string): string => readFileSync(file, 'utf8');

/** The files of the interface a file imports (by a relative path). */
function importsOf(file: string): string[] {
  const found: string[] = [];
  for (const [, spec] of source(file).matchAll(/from '(\.[^']+)'/g)) {
    const path = resolve(dirname(file), spec);
    const candidate = [path, `${path}.ts`].find((each) => statSync(each, { throwIfNoEntry: false })?.isFile());
    if (candidate?.startsWith(UI)) found.push(candidate);
  }
  return found;
}

/** Whether a file reaches the app: it, or anything it imports, asks for the deps. */
function reachesApp(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  if (!file.endsWith('deps.ts') && /\buseDeps\(/.test(source(file))) return true;
  return importsOf(file).some((each) => reachesApp(each, seen));
}

const componentsIn = (folder: string): string[] =>
  readdirSync(join(UI, folder))
    .filter((name) => name.endsWith('.vue'))
    .map((name) => join(UI, folder, name));
const onDesignPage = new Set(importsOf(DESIGN_PAGE));
const name = (file: string) => file.slice(UI.length + 1);

describe('the components of the interface', () => {
  it('building ones reach no further than themselves, and each stands on the design page', () => {
    const building = componentsIn('components');
    expect(building.filter((file) => reachesApp(file)).map(name)).toEqual([]);
    expect(building.filter((file) => !onDesignPage.has(file)).map(name)).toEqual([]);
  });

  it('the parts of screens reach the app, and none stands on the design page', () => {
    const parts = componentsIn('parts');
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.filter((file) => !reachesApp(file)).map(name)).toEqual([]);
    expect(parts.filter((file) => onDesignPage.has(file)).map(name)).toEqual([]);
  });
});
