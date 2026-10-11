import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* What a browser needs to install the app: the manifest, and the icons it names. */

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path));
const manifest = JSON.parse(read('public/manifest.webmanifest').toString()) as {
  name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
/** A PNG's width and height, from its header. */
const sizeOf = (png: Buffer) => ({ signature: png.subarray(1, 4).toString(), width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('installing the app', () => {
  it('has a manifest that opens the app in a window of its own, wherever the site is served from', () => {
    expect(manifest.name).toBe('Claviano');
    expect(manifest.display).toBe('standalone');
    // Relative: the site lives under /claviano/ on GitHub Pages and at the root in development.
    expect([manifest.start_url, manifest.scope]).toEqual(['.', '.']);
    expect(manifest.icons.every((icon) => !icon.src.startsWith('/'))).toBe(true);
  });

  it('has the icons the manifest names, of the sizes it says: 192 and 512, and one for cutting to shape', () => {
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split('x').map(Number);
      // (The address carries the drawing's number after "?": the file is what is before it.)
      expect(sizeOf(read(`public/${icon.src.split('?')[0]}`))).toEqual({ signature: 'PNG', width, height });
    }
    expect(manifest.icons.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512', '512x512']);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1);
  });

  it('names the manifest and an iPhone’s icon in the page', () => {
    const page = read('index.html').toString();
    expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(page).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png\?v=\d+" \/>/);
    expect(sizeOf(read('public/icons/apple-touch-icon.png'))).toEqual({ signature: 'PNG', width: 180, height: 180 });
    expect(page).toContain('<meta name="theme-color"');
  });
});
