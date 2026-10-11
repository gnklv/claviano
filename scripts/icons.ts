/**
 * Builds public/icons: the app's icon as PNG files, for installing the app (public/manifest.webmanifest
 * and the iPhone's tags in index.html name them). The icon is the favicon's (public/favicon.svg):
 * three piano keys on the app's dark surface, lit in the colours of the two hands.
 *
 * Nothing is needed to run it: the icon is a handful of rounded rectangles, drawn here and written
 * as PNG with what Node has (zlib). The shapes below repeat the favicon's: change both together.
 *
 * Run: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/** The favicon's own size: the shapes are in these units. */
const UNITS = 32;
const SURFACE = '#14161c';
/** A rectangle with rounded corners, as in the SVG. */
interface Shape {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
}
const KEYS: Shape[] = [
  { x: 5, y: 7, width: 6.6, height: 18, radius: 1.2, fill: '#ff9f43' },
  { x: 12.7, y: 7, width: 6.6, height: 18, radius: 1.2, fill: '#f4f1ea' },
  { x: 20.4, y: 7, width: 6.6, height: 18, radius: 1.2, fill: '#4f9dff' },
  { x: 9.6, y: 6, width: 5.1, height: 11, radius: 1, fill: SURFACE },
  { x: 17.3, y: 6, width: 5.1, height: 11, radius: 1, fill: SURFACE },
];

interface Icon {
  file: string;
  size: number;
  /** The surface's corners, in the favicon's units: 7 as the favicon has them, 0 for a full square. */
  corners: number;
  /** How much of the icon the keys take: 1 as in the favicon; less where the edges may be cut away. */
  scale: number;
}
const ICONS: Icon[] = [
  // For a browser's own lists and windows: as the favicon, corners and all.
  { file: 'icon-192.png', size: 192, corners: 7, scale: 1 },
  { file: 'icon-512.png', size: 512, corners: 7, scale: 1 },
  // "Maskable": Android cuts its icons to its own shape (a circle, a squircle), keeping the middle
  // four fifths for certain. A full square, with the keys well inside.
  { file: 'icon-maskable-512.png', size: 512, corners: 0, scale: 0.72 },
  // An iPhone rounds the corners itself, and wants no transparency.
  { file: 'apple-touch-icon.png', size: 180, corners: 0, scale: 0.86 },
];

/** Each pixel is sampled this many times across and down: smooth edges. */
const SAMPLES = 4;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

function inside(shape: Shape, x: number, y: number): boolean {
  const { radius } = shape;
  // The distance to the rectangle shrunk by the radius: within the radius of it is inside.
  const dx = Math.max(shape.x + radius - x, 0, x - (shape.x + shape.width - radius));
  const dy = Math.max(shape.y + radius - y, 0, y - (shape.y + shape.height - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/** The icon's pixels, as RGBA rows. */
function draw({ size, corners, scale }: Icon): Uint8Array {
  const surface: Shape = { x: 0, y: 0, width: UNITS, height: UNITS, radius: corners, fill: SURFACE };
  // The keys are drawn about the centre, `scale` of their size.
  const keys = KEYS.map((key) => ({
    ...key,
    x: UNITS / 2 + (key.x - UNITS / 2) * scale,
    y: UNITS / 2 + (key.y - UNITS / 2) * scale,
    width: key.width * scale,
    height: key.height * scale,
    radius: key.radius * scale,
  }));
  const shapes = [surface, ...keys].map((shape) => ({ shape, colour: rgb(shape.fill) }));
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * UNITS;
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * UNITS;
          // The last shape drawn over this point is the one seen.
          const top = shapes.findLast(({ shape }) => inside(shape, x, y));
          if (!top) continue;
          top.colour.forEach((part, i) => (sum[i]! += part));
          sum[3]! += 1;
        }
      }
      const covered = sum[3]!;
      const at = (py * size + px) * 4;
      // (Colour is kept unmixed with the transparency: that is how PNG holds it.)
      for (let i = 0; i < 3; i++) pixels[at + i] = covered ? Math.round(sum[i]! / covered) : 0;
      pixels[at + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return pixels;
}

// --- PNG: a signature, then chunks (length, name, data, checksum). ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(name, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  // Eight bits a channel, RGBA, no interlacing.
  header.set([8, 6, 0, 0, 0], 8);
  // Each row starts with its filter: none.
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rows.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

const directory = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(directory, { recursive: true });
for (const icon of ICONS) {
  const file = png(icon.size, draw(icon));
  writeFileSync(join(directory, icon.file), file);
  console.log(`${icon.file}: ${icon.size}×${icon.size}, ${(file.length / 1024).toFixed(1)} KB`);
}
