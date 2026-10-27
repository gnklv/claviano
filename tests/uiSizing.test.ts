import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Sizes in the interface come from tokens (ui/styles.css, each with its reason): a width, a height,
 * a shadow or an edge of so many pixels written in a component is a value no one else knows of (see
 * "Tokens, not values" in docs/rules.md). A number beside a token in a calc() is allowed. The
 * tokens themselves, and what styles.css says once for all, are written in pixels there.
 */

const UI = resolve('src/ui');

function componentsIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return componentsIn(path);
    return name.endsWith('.vue') ? [path] : [];
  });
}

describe('the sizes in the interface', () => {
  it('come from tokens: widths, heights, shadows and edges', () => {
    const handWritten = componentsIn(UI).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line: line.trim(), at: `${file.slice(UI.length + 1)}:${index + 1}` }))
        .filter(({ line }) => /^(width|height|min-width|min-height|max-width|max-height|box-shadow|border|border-[a-z-]+|outline|outline-[a-z-]+)\s*:/.test(line) && /(^|[\s(,])\d+(\.\d+)?px/.test(line) && !line.includes('calc('))
        .map(({ at, line }) => `${at} ${line}`),
    );
    expect(handWritten).toEqual([]);
  });
});
