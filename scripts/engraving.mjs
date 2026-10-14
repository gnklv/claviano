/**
 * Looks at how a piece is engraved, in a real browser: finds the signs of the staff that lie on
 * one another or fall outside the view, bar by bar, and photographs bars to be looked at. A tool
 * for working on the engraving: what it counts is not right or wrong by itself, but a number that
 * should go down, and a list of bars worth a look.
 *
 * Needs the dev server running (npm run dev) and Chrome. The piece is a file of samples/ (not
 * kept in the repository) or a demo ("demo.showcase").
 *
 *   node scripts/engraving.mjs czardas.mxl                  the count, and the worst bars
 *   node scripts/engraving.mjs czardas.mxl --shots 0,8,19   also photographs those bars (from 0)
 *   node scripts/engraving.mjs demo.showcase --every 4      photographs every fourth bar
 *
 * Photographs go to .engraving/ (not kept either). CHROME names another browser to drive; SIZE
 * another view than 1600x420 (a phone: 390x844, on its side 844x390); THEME=dark the dark theme.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [piece, ...options] = process.argv.slice(2);
if (!piece) throw new Error('Which piece? A file of samples/, or demo.<id>.');
const option = (name) => (options.includes(name) ? options[options.indexOf(name) + 1] : null);
const [width, height] = (process.env.SIZE ?? '1600x420').split('x').map(Number);
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
/** A view as narrow as a phone's is one: touched, not pointed at. */
const PHONE = width < 600 || height < 500;
const OUT = '.engraving';
const APP = 'http://localhost:5173/claviano/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Runs in the page. Every sign of the tape is a <text>: its ink is measured as a canvas would draw
 * it (the box of a <text> in SVG is its font's line, far taller than a notehead), and signs whose
 * ink shares a fifth of the smaller one's area are told. A note's own flag touches its head, and
 * the dots of two voices on one note are one dot to the eye: those are left out.
 */
function scan() {
  const staff = document.querySelector('.staff');
  const tape = staff.children[1].querySelector('svg');
  const view = staff.getBoundingClientRect();
  // The page shows only the tape near the view: the whole of it is shown to be read.
  for (const hidden of tape.querySelectorAll('[style*="display"]')) hidden.style.display = '';
  const canvas = document.createElement('canvas').getContext('2d');
  const name = (text) => [...text].map((c) => (c.codePointAt(0) >= 0xe000 ? `U+${c.codePointAt(0).toString(16).toUpperCase()}` : c)).join('');
  const signs = [...tape.querySelectorAll('text')].flatMap((text) => {
    const content = text.textContent;
    if (!content) return [];
    const family = text.getAttribute('font-family');
    canvas.font = `${text.getAttribute('font-style') ?? ''} ${text.getAttribute('font-weight') ?? ''} ${parseFloat(text.getAttribute('font-size'))}px ${family}`;
    const ink = canvas.measureText(content);
    const anchor = text.getAttribute('text-anchor') ?? 'start';
    const shift = anchor === 'middle' ? -ink.width / 2 : anchor === 'end' ? -ink.width : 0;
    const place = text.getCTM();
    const x = Number(text.getAttribute('x')) + shift + place.e;
    const y = Number(text.getAttribute('y')) + place.f;
    return [
      {
        left: x - ink.actualBoundingBoxLeft,
        right: x + ink.actualBoundingBoxRight,
        top: y - ink.actualBoundingBoxAscent,
        bottom: y + ink.actualBoundingBoxDescent,
        name: name(content),
        barNumber: family.includes('system-ui') && /^\d+$/.test(content),
      },
    ];
  });
  signs.sort((a, b) => a.left - b.left);
  const numbers = signs.filter((sign) => sign.barNumber);
  const barAt = (x) => numbers.reduce((bar, number) => (number.left <= x + 2 ? number.name : bar), '?');
  const HEAD = 'U+E0A4';
  const DOT = 'U+E1E7';
  const FLAGS = new Set(['U+E240', 'U+E241', 'U+E242', 'U+E243']);
  const nothing = (a, b) => (a === DOT && b === DOT) || [a, b].some((sign) => FLAGS.has(sign)) && [a, b].some((sign) => sign === HEAD || sign === DOT);
  const overlaps = [];
  signs.forEach((a, i) => {
    const areaA = (a.right - a.left) * (a.bottom - a.top);
    for (let j = i + 1; j < signs.length && signs[j].left < a.right; j++) {
      const b = signs[j];
      const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const smaller = Math.min(areaA, (b.right - b.left) * (b.bottom - b.top));
      if (across > 0.5 && down > 0.5 && smaller > 0 && (across * down) / smaller > 0.2 && !nothing(a.name, b.name)) overlaps.push({ bar: barAt(Math.max(a.left, b.left)), signs: `${a.name} ${b.name}` });
    }
  });
  const outside = signs.filter((sign) => sign.top < 0 || sign.bottom > view.height).map((sign) => ({ bar: barAt(sign.left), sign: sign.name, by: Math.round(sign.top < 0 ? -sign.top : sign.bottom - view.height) }));
  return JSON.stringify({ signs: signs.length, overlaps, outside });
}

// --- A browser, driven over its debugging port. ---
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', `--user-data-dir=${OUT}/profile-${port}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });
let pages;
for (let tries = 0; tries < 60 && !pages; tries++) {
  await sleep(250);
  pages = await fetch(`http://127.0.0.1:${port}/json`).then((answer) => answer.json()).catch(() => null);
}
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => (socket.onopen = resolve));
let asked = 0;
const answers = new Map();
socket.onmessage = (message) => {
  const data = JSON.parse(message.data);
  answers.get(data.id)?.(data);
};
const send = (method, params = {}) => new Promise((resolve) => (answers.set(++asked, resolve), socket.send(JSON.stringify({ id: asked, method, params }))));
const inPage = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  const up = await fetch(APP).then((answer) => answer.ok).catch(() => false);
  if (!up) throw new Error(`Nothing answers at ${APP}: start the dev server (npm run dev).`);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: PHONE ? 2 : 1, mobile: PHONE });
  if (PHONE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `${APP}#/` });
  await sleep(1500);
  await inPage(`localStorage.setItem('claviano.view', 'staff'); localStorage.setItem('claviano.theme', '${THEME}'); localStorage.setItem('claviano.locale', 'en')`);
  await send('Page.navigate', { url: `${APP}?engraving#/` });
  await sleep(1500);
  const open = piece.startsWith('demo.') ? `window.claviano.library.open('${piece}')` : `fetch('/samples/${piece}').then((file) => file.arrayBuffer()).then((data) => window.claviano.library.openFile('${piece}', data))`;
  const bars = await inPage(`(async () => { await ${open}; await new Promise((resolve) => setTimeout(resolve, 2500)); return window.claviano.playback.score?.bars.length ?? 0; })()`);
  if (!bars) throw new Error(`${piece} did not open: is the dev server up, and the file in samples/?`);

  const found = JSON.parse(await inPage(`(${scan.toString()})()`));
  const most = (list, by) => Object.entries(Object.groupBy(list, by)).map(([key, all]) => `${key} ×${all.length}`).sort((a, b) => Number(b.split('×')[1]) - Number(a.split('×')[1])).slice(0, 10);
  console.log(`${piece}: ${bars} bars, ${found.signs} signs`);
  console.log(`  lying on one another: ${found.overlaps.length}`, most(found.overlaps, (overlap) => overlap.signs));
  console.log('  in bars:', most(found.overlaps, (overlap) => `bar ${overlap.bar}`));
  console.log(`  outside the view: ${found.outside.length}`, found.outside.slice(0, 10).map((sign) => `${sign.sign} in bar ${sign.bar} by ${sign.by}px`));

  const every = option('--every');
  const shots = every ? Array.from({ length: Math.ceil(bars / Number(every)) }, (_, i) => i * Number(every)) : (option('--shots')?.split(',').map(Number) ?? []);
  for (const bar of shots) {
    await inPage(`(async () => { const playback = window.claviano.playback; playback.seek(playback.score.bars[${bar}] ?? 0); await new Promise((resolve) => setTimeout(resolve, 900)); })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${OUT}/${piece.replace(/\..*$/, '')}-${width}x${height}-${THEME}-${String(bar).padStart(3, '0')}.png`;
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('  photographed', file);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
process.exit();
