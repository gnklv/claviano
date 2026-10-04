/** How long to wait for the service worker to take over before going on without it. */
const TAKEOVER_TIMEOUT_MS = 2000;

/**
 * Starts the service worker (public/sw.js) that keeps the app and the piano's samples on disk:
 * a second visit starts at once and works without the network.
 *
 * Resolves when the worker handles this page's requests (so what is fetched after that is kept),
 * or at once where there is none: an old browser, or a failure to start it.
 */
export async function startOfflineCache(baseUrl: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
    await Promise.race([takeover(), new Promise((resolve) => setTimeout(resolve, TAKEOVER_TIMEOUT_MS))]);
    keepLoaded();
  } catch (error) {
    console.warn('No offline cache.', error);
  }
}

/** Resolves once a service worker controls this page (at once on every visit but the first). */
function takeover(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
}

/**
 * On the first visit the page itself, its scripts, styles and fonts were fetched before the worker
 * took over: once all are in, the worker is told to keep them too.
 */
function keepLoaded(): void {
  const send = () => {
    const urls = [location.href, ...performance.getEntriesByType('resource').map((entry) => entry.name)];
    navigator.serviceWorker.controller?.postMessage({ type: 'keep', urls });
  };
  if (document.readyState === 'complete') send();
  else window.addEventListener('load', send, { once: true });
}
