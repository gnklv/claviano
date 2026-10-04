/*
 * The service worker: keeps the app and the piano's samples on disk, so a second visit starts at
 * once and works without the network. Registered only in the built app (see offlineCache.ts).
 *
 * - Piano samples never change under one address (it carries the set's version): from the cache
 *   if they are there, else fetched and kept.
 * - Everything else (the page, scripts, styles, fonts, demos, the samples' manifest): from the
 *   network, so a new version shows up at once; the kept copy is for when the network is away.
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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !isOurs(url)) return;
  event.respondWith(isSample(url) ? cacheFirst(request) : networkFirst(request));
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

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (keepable(response)) {
      await cache.put(request, response.clone());
      if (isManifest(new URL(request.url))) await dropOldSamples(response.clone());
    }
    return response;
  } catch (error) {
    // Without the network: the kept copy; any page address is the one page of the app.
    const kept = (await find(cache, request.url)) ?? (request.mode === 'navigate' ? await find(cache, scope.href) : undefined);
    if (kept) return kept;
    throw error;
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
