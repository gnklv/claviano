/**
 * Builds public/piano: the piano samples the player loads, cut down from the Salamander Grand
 * Piano (a Yamaha C5 recorded by Alexander Holm, CC BY 3.0) to a size fit for the web.
 *
 * The original has 16 loudness layers of 30 notes each (every minor third from the lowest A; the
 * notes between are played from their neighbour, a semitone up or down), as 1.1 GB of WAV. Here:
 * three layers (soft, medium, loud) and the sounds of keys and the pedal coming up, tails cut short, MP3 (the one format every browser decodes).
 *
 * Needs ffmpeg, and the original unpacked (44.1 kHz, 16 bit) from
 * https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
 * Run: npm run samples -- [path to its 44.1khz16bit folder]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
/** A fingerprint of every file: the set's version, so browsers keep the samples until they change. */
const contents = createHash('sha1');

/** Encodes one original file into the set; `trim`: cut and fade it as a note's tail. Returns its size. */
function encode(source: string, path: string, trim: { seconds: number; fade: number } | null): number {
  mkdirSync(join(OUT, path, '..'), { recursive: true });
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-i', join(SOURCE, source),
    ...(trim ? ['-t', String(trim.seconds), '-af', `afade=t=out:st=${trim.seconds - trim.fade}:d=${trim.fade}`] : []),
    '-map_metadata', '-1',
    '-c:a', 'libmp3lame', '-q:a', String(MP3_QUALITY),
    join(OUT, path),
  ]);
  const content = readFileSync(join(OUT, path));
  total += content.length;
  contents.update(path).update(content);
  return content.length;
}

/** The original's files named `<prefix><note><suffix>.wav`, as notes of the set in `folder`, lowest first. */
function notesOf(prefix: string, suffix: string, folder: string, trim: { seconds: number; fade: number } | null) {
  const notes = files
    .flatMap((file) => {
      const match = new RegExp(`^${prefix}([A-G]#?\\d)${suffix}\\.wav$`).exec(file);
      return match ? [{ file, pitch: midiPitch(match[1]) }] : [];
    })
    .sort((a, b) => a.pitch - b.pitch)
    .map(({ file, pitch }) => ({ pitch, file: `${folder}/${pitch}.mp3`, bytes: encode(file, `${folder}/${pitch}.mp3`, trim) }));
  console.log(`${folder}: ${notes.length} files, ${Math.round(notes.reduce((sum, n) => sum + n.bytes, 0) / 1024)} KB`);
  return notes;
}

const layers = LAYERS.map(({ layer, velocity }) => ({
  id: `v${layer}`,
  velocity,
  notes: notesOf('', `v${layer}`, `v${layer}`, { seconds: MAX_SECONDS, fade: FADE_SECONDS }),
}));

/*
 * The small sounds of the instrument itself, fetched last: the knock of each key coming up (the
 * original's rel1…rel88, from the lowest A), the strings' short ring as the damper lands (softer
 * and louder strikes, every third key up to where the piano has dampers), and the pedal's noise.
 */
const release = Array.from({ length: 88 }, (_, i) => {
  const pitch = 21 + i;
  return { pitch, file: `release/${pitch}.mp3`, bytes: encode(`rel${i + 1}.wav`, `release/${pitch}.mp3`, null) };
});
const extras = {
  release,
  resonance: {
    /** Strikes softer than this MIDI velocity ring from `soft`, the others from `loud`. */
    splitVelocity: 45,
    soft: notesOf('harmS', '', 'resonance-soft', null),
    loud: notesOf('harmL', '', 'resonance-loud', null),
  },
  pedal: {
    down: [1, 2].map((n) => (encode(`pedalD${n}.wav`, `pedal/down${n}.mp3`, { seconds: 4, fade: 1.5 }), `pedal/down${n}.mp3`)),
    up: [1, 2].map((n) => (encode(`pedalU${n}.wav`, `pedal/up${n}.mp3`, null), `pedal/up${n}.mp3`)),
  },
};

const manifest = {
  name: 'Salamander Grand Piano V3',
  instrument: 'Yamaha C5',
  author: 'Alexander Holm',
  license: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html',
  changes: 'A selection of the loudness layers and release sounds, tails shortened, converted to MP3.',
  version: contents.digest('hex').slice(0, 8),
  base: `v${BASE_LAYER}`,
  layers,
  extras,
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`public/piano: ${Math.round(total / 1024)} KB`);
