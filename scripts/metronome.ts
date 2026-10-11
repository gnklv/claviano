/**
 * Builds public/piano/metronome: the metronome's clicks, cut from a recording of a metronome
 * ("metronome 121bpm" by djfroyd; public domain, CC0:
 * https://freesound.org/people/djfroyd/sounds/262867/). It clicks in fours: a higher click on the
 * first beat of a bar, a lower one on the others. One of each is taken (they are an electronic
 * metronome's: every click of a kind is the same).
 *
 * They live with the piano's samples and are listed in its manifest (extras.metronome), so they
 * are fetched, cached and decoded the same way. They have a version of their own there, a
 * fingerprint of their content: clicks cut anew are fetched anew, and the piano's samples are not.
 *
 * Needs ffmpeg, and the recording (the site's preview will do; its original needs an account).
 * Run: npm run metronome -- [path to the recording]
 * (npm run samples rebuilds public/piano from scratch: run this after it.)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SOURCE = process.argv[2] ?? join(homedir(), 'Downloads/claviano-metronome/djfroyd-262867-hq.mp3');
const PIANO = join(import.meta.dirname, '../public/piano');
const OUT = join(PIANO, 'metronome');

/** Where the clicks to take start in the recording, in seconds: the first sample of each. */
const CLICKS = { accent: 3.7398, beat: 4.2084 };
/** A click is over in 20 ms. Cut well after that, fading out, so nothing of the next one is in. */
const SECONDS = 0.08;
const FADE_SECONDS = 0.03;
/** Cut from just before the click, so its very start is whole. */
const LEAD_SECONDS = 0.002;
/** The recording runs a little over full scale; brought down to leave room. */
const GAIN = 0.85;

if (!existsSync(SOURCE)) {
  console.error(`No recording at ${SOURCE}\nPass the path to it.`);
  process.exit(1);
}
if (!existsSync(join(PIANO, 'manifest.json'))) {
  console.error('No public/piano/manifest.json: build the piano samples first (npm run samples).');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const contents = createHash('sha1');
const cut = (kind: keyof typeof CLICKS): string => {
  const name = `metronome/${kind}.wav`;
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-i', SOURCE,
    // One channel (the recording's two are the same), and no second lossy encoding: a click is
    // all attack, which MP3 smears; done twice over, it comes out rattling and blurred.
    '-ac', '1', '-ar', '44100',
    // Cut in the decoded sound, to the sample (atrim): sought in the MP3 itself, the place lands a
    // frame or so off, which is more than a click lasts.
    '-af', `atrim=start=${CLICKS[kind] - LEAD_SECONDS}:duration=${SECONDS},asetpts=PTS-STARTPTS,volume=${GAIN},afade=t=out:st=${SECONDS - FADE_SECONDS}:d=${FADE_SECONDS}`,
    '-map_metadata', '-1', '-bitexact',
    '-c:a', 'pcm_s16le',
    join(PIANO, name),
  ]);
  contents.update(name).update(readFileSync(join(PIANO, name)));
  return name;
};
const accent = cut('accent');
const beat = cut('beat');

const manifestPath = join(PIANO, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { extras: Record<string, unknown> };
manifest.extras.metronome = { version: contents.digest('hex').slice(0, 8), accent, beat };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`public/piano/metronome: ${Math.round((readFileSync(join(PIANO, accent)).length + readFileSync(join(PIANO, beat)).length) / 1024)} KB`);
