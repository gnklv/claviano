// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOfflineCache } from '../src/infrastructure/offline/offlineCache';

/*
 * Starting the service worker from the page: registering it, waiting for it to take over, and
 * telling it what the page loaded before that. The browser's side of it is a stand-in.
 */

class FakeServiceWorkers extends EventTarget {
  controller: { postMessage: ReturnType<typeof vi.fn> } | null = null;
  register = vi.fn((_script: string, _options: { scope: string }) => Promise.resolve());

  /** A worker takes over the page. */
  takeOver(): void {
    this.controller = { postMessage: vi.fn() };
    this.dispatchEvent(new Event('controllerchange'));
  }
}

let workers: FakeServiceWorkers;

const setReadyState = (state: DocumentReadyState) => Object.defineProperty(document, 'readyState', { value: state, configurable: true });

beforeEach(() => {
  workers = new FakeServiceWorkers();
  Object.defineProperty(navigator, 'serviceWorker', { value: workers, configurable: true });
  setReadyState('complete');
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ name: 'https://example.org/claviano/assets/app.js' }, { name: 'https://example.org/claviano/assets/app.css' }] as PerformanceEntry[]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // (Only the timers: the page's performance entries are a stand-in of their own.)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(document, 'readyState');
});

describe('startOfflineCache', () => {
  it('does nothing in a browser without service workers', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect('serviceWorker' in navigator).toBe(false);
    await startOfflineCache('/claviano/');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('registers the worker beside the app, for the app’s folder', async () => {
    workers.takeOver();
    await startOfflineCache('/claviano/');
    expect(workers.register).toHaveBeenCalledWith('/claviano/sw.js', { scope: '/claviano/' });
  });

  it('on a later visit goes on at once: the worker already has the page', async () => {
    workers.takeOver();
    let done = false;
    void startOfflineCache('/claviano/').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('on the first visit waits for the worker to take over', async () => {
    let done = false;
    void startOfflineCache('/claviano/').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);

    workers.takeOver();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('goes on without the worker when it does not take over in a couple of seconds', async () => {
    let done = false;
    void startOfflineCache('/claviano/').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('goes on without the worker when it fails to start, and says so', async () => {
    workers.register.mockRejectedValue(new Error('blocked'));
    await startOfflineCache('/claviano/');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  describe('what the page loaded before the worker took over', () => {
    it('is told to the worker: the page itself and everything it fetched', async () => {
      workers.takeOver();
      await startOfflineCache('/claviano/');
      expect(workers.controller!.postMessage).toHaveBeenCalledWith({
        type: 'keep',
        urls: [location.href, 'https://example.org/claviano/assets/app.js', 'https://example.org/claviano/assets/app.css'],
      });
    });

    it('is told only once everything is in, when the page is still loading', async () => {
      setReadyState('loading');
      workers.takeOver();
      await startOfflineCache('/claviano/');
      expect(workers.controller!.postMessage).not.toHaveBeenCalled();

      window.dispatchEvent(new Event('load'));
      expect(workers.controller!.postMessage).toHaveBeenCalledOnce();
    });

    it('is told to nobody when no worker took over', async () => {
      const started = startOfflineCache('/claviano/');
      await vi.advanceTimersByTimeAsync(2100);
      await started;
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
