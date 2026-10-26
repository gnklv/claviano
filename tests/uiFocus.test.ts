import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the keys have reached is ringed in ink, all of it alike (see "Focus" in docs/design.md): no
 * outline is taken away anywhere (that was where the system's ring, or none, was left), and a ring
 * drawn by a component of its own is the same ring, of the tokens.
 */

const UI = resolve('src/ui');

function styles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return styles(path);
    return /\.(vue|css)$/.test(name) ? [path] : [];
  });
}

const lines = () =>
  styles(UI).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ line: line.trim(), at: `${file.slice(UI.length + 1)}:${index + 1}` })),
  );

describe('the focus ring', () => {
  it('is never taken away', () => {
    expect(lines().filter(({ line }) => /^outline\s*:\s*(none|0)\b/.test(line)).map(({ at, line }) => `${at} ${line}`)).toEqual([]);
  });

  it('is drawn of the tokens wherever it is drawn', () => {
    const outlines = lines().filter(({ line }) => /^outline(-offset)?\s*:/.test(line));
    expect(outlines.length).toBeGreaterThan(0);
    expect(outlines.filter(({ line }) => !line.includes('var(--focus-')).map(({ at, line }) => `${at} ${line}`)).toEqual([]);
  });
});
