import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The colours read against what they stand on, in both themes (see "Colour" in docs/design.md):
 * the hands' inks are graphics (a tile, a line, a lit key) and want 3:1 at the least; the quiet ink
 * is small words and wants 4.5:1. Read from the stylesheet, as the themes are written there.
 */

const STYLES = readFileSync(resolve('src/ui/styles.css'), 'utf8');

/** A theme's colours by token, as its block says them. */
function theme(name: 'dark' | 'light'): Record<string, string> {
  const block = STYLES.match(new RegExp(`:root\\[data-theme='${name}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((match) => [match[1], match[2]]));
}

/** WCAG's relative luminance of a colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('the colours, against what they stand on', () => {
  for (const name of ['dark', 'light'] as const) {
    const colours = theme(name);
    for (const ground of ['--bg', '--panel']) {
      it(`${name}: the hands' inks are seen on ${ground} (3:1), the quiet ink is read on it (4.5:1)`, () => {
        for (const token of ['--bg', '--panel', '--left', '--right', '--muted']) expect(colours[token], token).toMatch(/^#/);
        expect(contrast(colours['--left'], colours[ground])).toBeGreaterThanOrEqual(3);
        expect(contrast(colours['--right'], colours[ground])).toBeGreaterThanOrEqual(3);
        expect(contrast(colours['--muted'], colours[ground])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
