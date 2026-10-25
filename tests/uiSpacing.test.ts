import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Space in the interface comes from the scale (--space-0 to --space-6, see "Space and shape" in
 * docs/design.md): a padding, a margin, a gap or an inset of so many pixels written by hand is a
 * second scale beginning. A number beside a token in a calc() is allowed: an edge's pixel taken off,
 * the middle of a thumb (each says why where it stands).
 */

const UI = resolve('src/ui');

function stylesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return stylesIn(path);
    return /\.(vue|css)$/.test(name) ? [path] : [];
  });
}

describe('the space in the interface', () => {
  it('comes from the scale, not from pixels written by hand', () => {
    const handWritten = stylesIn(UI).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line: line.trim(), at: `${file.slice(UI.length + 1)}:${index + 1}` }))
        .filter(({ line }) => /^(padding|margin|gap|inset|column-gap|row-gap)[a-z-]*\s*:/.test(line) && /(^|[\s(])\d+(\.\d+)?px/.test(line) && !line.includes('calc('))
        .map(({ at, line }) => `${at} ${line}`),
    );
    expect(handWritten).toEqual([]);
  });
});
