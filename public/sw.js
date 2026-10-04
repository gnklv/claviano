/*
 * The service worker: keeps the app and the piano's samples on disk, so a second visit starts at
 * once and works without the network. Registered only in the built app (see offlineCache.ts).
 *
 * - Piano samples never change under one address (it carries the set's version): from the cache
 *   if they are there, else fetched and kept.
 * - Everything else (the page, scripts, styles, fonts, demos, the samples' manifest): from the
 *   network, so a new version shows up at once; the kept copy is for when the network is away,
 *   or too slow to wait for.
 * - What a new version no longer uses is let go: the old set's samples, the old build's scripts.
 */
const APP_CACHE = 'claviano-app-v1';
const PIANO_CACHE = 'claviano-piano-v1';

const scope = new URL(self.registration.scope);
const isOurs = (url) => url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
const isSample = (url) => url.pathname.startsWith(`${scope.pathname}piano/`) && url.pathname.endsWith('.mp3');
const isManifest = (url) => url.pathname === `${scope.pathname}piano/manifest.json`;
const cacheFor = (url) => caches.open(isSample(url) ? PIANO_CACHE : APP_CACHE);
/** Only whole, successful answers are worth keeping. */
const keepable = (response) => response.ok && response.status === 200;
/** How long the network is waited for when there is a kept copy to show instead. */
const NETWORK_PATIENCE_MS = 4000;
/** The build's scripts and styles: their names change with their content, so old ones are never asked for again. */
const isBuilt = (url) => url.pathname.startsWith(`${scope.pathname}assets/`);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !isOurs(url)) return;
  event.respondWith(isSample(url) ? cacheFirst(request) : networkFirst(request, event));
});

/** The page lists what it loaded before this worker took over, to be kept too. */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'keep') return;
  event.waitUntil(
    Promise.all(
      event.data.urls.map(async (address) => {
        const url = new URL(address);
        if (!isOurs(url)) return;
        const cache = await cacheFor(url);
        if (await find(cache, address)) return;
        const response = await fetch(address).catch(() => null);
        if (response && keepable(response)) await cache.put(address, response);
      }),
    ),
  );
});

/**
 * A kept answer by its address alone. Servers mark answers as varying with request headers
 * (Vary: Origin); a page's own requests for its script, styles and fonts carry other headers than
 * the request the answer was kept under, and would not find it.
 */
const find = (cache, address) => cache.match(address, { ignoreVary: true });

async function cacheFirst(request) {
  const cache = await caches.open(PIANO_CACHE);
  const kept = await find(cache, request.url);
  if (kept) return kept;
  const response = await fetch(request);
  if (keepable(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, event) {
  const cache = await caches.open(APP_CACHE);
  const url = new URL(request.url);
  const fresh = fetch(request).then(async (response) => {
    if (keepable(response)) {
      await cache.put(request, response.clone());
      if (isManifest(url)) await dropOldSamples(response.clone());
      if (request.mode === 'navigate') await dropOldBuild(response.clone());
    }
    return response;
  });
  // The kept copy; any page address is the one page of the app.
  const kept = async () => (await find(cache, request.url)) ?? (request.mode === 'navigate' ? await find(cache, scope.href) : undefined);
  try {
    return await Promise.race([fresh, new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), NETWORK_PATIENCE_MS))]);
  } catch (error) {
    // No network, or a slow one: the kept copy now, while the answer (if it comes) is kept for next time.
    const copy = await kept();
    if (!copy) return fresh;
    event.waitUntil(fresh.catch(() => undefined));
    return copy;
  }
}

/**
 * A new build has new scripts and styles under new names: the page says which, and the kept ones
 * it no longer names are of no more use.
 */
async function dropOldBuild(page) {
  const html = await page.text();
  const named = new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => new URL(match[1], scope).href));
  const cache = await caches.open(APP_CACHE);
  for (const request of await cache.keys()) {
    if (isBuilt(new URL(request.url)) && !named.has(request.url)) await cache.delete(request);
  }
}

/** A rebuilt sample set has a new version: the old set's files are of no more use. */
async function dropOldSamples(manifest) {
  const { version } = await manifest.json();
  const cache = await caches.open(PIANO_CACHE);
  for (const request of await cache.keys()) {
    if (new URL(request.url).searchParams.get('v') !== version) await cache.delete(request);
  }
}
