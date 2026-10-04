/**
 * Builds public/piano: the piano samples the player loads, cut down from the Salamander Grand
 * Piano (a Yamaha C5 recorded by Alexander Holm, CC BY 3.0) to a size fit for the web.
 *
 * The original has 16 loudness layers of 30 notes each (every minor third from the lowest A; the
 * notes between are played from their neighbour, a semitone up or down), as 1.1 GB of WAV. Here:
 * three layers (soft, medium, loud), tails cut short, MP3 (the one format every browser decodes).
 *
 * Needs ffmpeg, and the original unpacked (44.1 kHz, 16 bit) from
 * https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
 * Run: npm run samples -- [path to its 44.1khz16bit folder]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SOURCE = process.argv[2] ?? join(homedir(), 'Downloads/SalamanderGrandPianoV3_44.1khz16bit/44.1khz16bit');
const OUT = join(import.meta.dirname, '../public/piano');

/**
 * The layers to keep, of the original's 16 (1 the softest), and the MIDI velocities each was
 * recorded for (from the original's .sfz).
 */
const LAYERS: { layer: number; velocity: [number, number] }[] = [
  { layer: 4, velocity: [37, 43] },
  { layer: 8, velocity: [57, 64] },
  { layer: 13, velocity: [97, 104] },
];
/** The layer the player fetches first and plays from alone until the others are in. */
const BASE_LAYER = 8;

/** A bass note rings for 25 seconds; nobody waits that long. Cut there, fading out over the last part. */
const MAX_SECONDS = 12;
const FADE_SECONDS = 2;
/** LAME's VBR quality: 0 the best, 9 the smallest. 6 is about 100 kbit/s on loud passages, far less on tails; by ear the same as 4. */
const MP3_QUALITY = 6;

const SEMITONES: Record<string, number> = { C: 0, 'D#': 3, 'F#': 6, A: 9 };

/** "D#4" → 63 (C4 is 60). */
function midiPitch(name: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(name);
  if (!match || !(match[1] in SEMITONES)) throw new Error(`Unexpected note name: ${name}`);
  return 12 * (Number(match[2]) + 1) + SEMITONES[match[1]];
}

if (!existsSync(SOURCE)) {
  console.error(`No samples at ${SOURCE}\nPass the path to the original's 44.1khz16bit folder.`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
const files = readdirSync(SOURCE);
let total = 0;

const layers = LAYERS.map(({ layer, velocity }) => {
  const folder = `v${layer}`;
  mkdirSync(join(OUT, folder), { recursive: true });
  const notes = files
    .flatMap((file) => {
      const match = new RegExp(`^([A-G]#?\\d)v${layer}\\.wav$`).exec(file);
      return match ? [{ file, pitch: midiPitch(match[1]) }] : [];
    })
    .sort((a, b) => a.pitch - b.pitch)
    .map(({ file, pitch }) => {
      const path = `${folder}/${pitch}.mp3`;
      execFileSync('ffmpeg', [
        '-v', 'error', '-y',
        '-i', join(SOURCE, file),
        '-t', String(MAX_SECONDS),
        '-af', `afade=t=out:st=${MAX_SECONDS - FADE_SECONDS}:d=${FADE_SECONDS}`,
        '-map_metadata', '-1',
        '-c:a', 'libmp3lame', '-q:a', String(MP3_QUALITY),
        join(OUT, path),
      ]);
      const bytes = statSync(join(OUT, path)).size;
      total += bytes;
      return { pitch, file: path, bytes };
    });
  console.log(`${folder}: ${notes.length} notes, ${Math.round(notes.reduce((sum, n) => sum + n.bytes, 0) / 1024)} KB`);
  return { id: folder, velocity, notes };
});

const manifest = {
  name: 'Salamander Grand Piano V3',
  instrument: 'Yamaha C5',
  author: 'Alexander Holm',
  license: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html',
  changes: 'A selection of the loudness layers, tails shortened, converted to MP3.',
  base: `v${BASE_LAYER}`,
  layers,
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`public/piano: ${Math.round(total / 1024)} KB`);
