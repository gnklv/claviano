import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The service worker (public/sw.js), run here as the browser runs it: as a script with `self`,
 * `caches` and `fetch` around it. The caches and the network are stand-ins.
 */

const SCOPE = 'https://example.org/claviano/';
const at = (path: string) => SCOPE + path;

/** A request as the worker sees it. (A real Request cannot be made with mode "navigate".) */
interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}
const get = (path: string, mode = 'cors'): FakeRequest => ({ url: path.startsWith('http') ? path : at(path), method: 'GET', mode });

class FakeCache {
  readonly kept = new Map<string, Response>();
  match = (address: string) => Promise.resolve(this.kept.get(address)?.clone());
  put = (request: FakeRequest | string, response: Response) => {
    this.kept.set(typeof request === 'string' ? request : request.url, response);
    return Promise.resolve();
  };
  keys = () => Promise.resolve([...this.kept.keys()].map((url) => ({ url })));
  delete = (request: { url: string }) => Promise.resolve(this.kept.delete(request.url));
}

/** The network: answers by address, or none at all (offline), or late. */
class FakeNetwork {
  answers = new Map<string, () => Response>();
  offline = false;
  /** Milliseconds every answer takes. */
  delay = 0;
  requests: string[] = [];

  fetch = async (request: FakeRequest | string): Promise<Response> => {
    const url = typeof request === 'string' ? request : request.url;
    this.requests.push(url);
    if (this.delay > 0) await new Promise((resolve) => setTimeout(resolve, this.delay));
    if (this.offline) throw new TypeError('Failed to fetch');
    return this.answers.get(url)?.() ?? new Response('not found', { status: 404 });
  };

  has(path: string, body: string): void {
    this.answers.set(at(path), () => new Response(body));
  }
}

type Listener = (event: Record<string, unknown>) => void;

let listeners: Map<string, Listener>;
let caches: Map<string, FakeCache>;
let network: FakeNetwork;
let self: { skipWaiting: ReturnType<typeof vi.fn>; clients: { claim: ReturnType<typeof vi.fn> } };

const cache = (name: 'app' | 'piano'): FakeCache => {
  const full = `claviano-${name}-v1`;
  if (!caches.has(full)) caches.set(full, new FakeCache());
  return caches.get(full)!;
};
const keptIn = (name: 'app' | 'piano'): string[] => [...cache(name).kept.keys()].map((url) => url.replace(SCOPE, '')).sort();

/** Sends the worker a request, as the browser does; null when the worker leaves it to the browser. */
async function ask(request: FakeRequest): Promise<{ response: Response; settled: Promise<unknown>; keptAlive: boolean } | null> {
  let answer: Promise<Response> | null = null;
  const waiting: Promise<unknown>[] = [];
  listeners.get('fetch')!({
    request,
    respondWith: (response: Promise<Response>) => (answer = response),
    waitUntil: (work: Promise<unknown>) => waiting.push(work),
  });
  if (!answer) return null;
  const response = await (answer as Promise<Response>);
  // (The browser may stop a worker that has answered, unless it asked to be kept alive for more work.)
  return { response, settled: Promise.all(waiting), keptAlive: waiting.length > 0 };
}
const text = async (request: FakeRequest): Promise<string> => (await ask(request))!.response.text();

beforeEach(() => {
  listeners = new Map();
  caches = new Map();
  network = new FakeNetwork();
  self = { skipWaiting: vi.fn(), clients: { claim: vi.fn(() => Promise.resolve()) } };
  const scope = {
    ...self,
    registration: { scope: SCOPE },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  const storage = {
    open: (name: string) => {
      if (!caches.has(name)) caches.set(name, new FakeCache());
      return Promise.resolve(caches.get(name)!);
    },
  };
  // The worker is a script, not a module: it is run with these around it.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('self', 'caches', 'fetch', readFileSync('public/sw.js', 'utf8')) as (...around: unknown[]) => void;
  run(scope, storage, network.fetch);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the service worker', () => {
  it('takes over at once: a new version does not wait for the old pages to close', async () => {
    listeners.get('install')!({});
    expect(self.skipWaiting).toHaveBeenCalled();
    const waiting: Promise<unknown>[] = [];
    listeners.get('activate')!({ waitUntil: (work: Promise<unknown>) => waiting.push(work) });
    await Promise.all(waiting);
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it('leaves alone what is not the app’s: other sites, other folders, anything but reading', async () => {
    expect(await ask(get('https://fonts.example.com/font.woff2'))).toBeNull();
    expect(await ask(get('https://example.org/other/page.html'))).toBeNull();
    expect(await ask({ ...get('index.html'), method: 'POST' })).toBeNull();
    expect(network.requests).toEqual([]);
  });

  describe('piano samples', () => {
    it('are fetched once, kept, and from then on come without the network', async () => {
      network.has('piano/loud/60.mp3?v=abc', 'sound');
      expect(await text(get('piano/loud/60.mp3?v=abc'))).toBe('sound');
      expect(keptIn('piano')).toEqual(['piano/loud/60.mp3?v=abc']);

      network.offline = true;
      expect(await text(get('piano/loud/60.mp3?v=abc'))).toBe('sound');
      expect(network.requests.length).toBe(1);
    });

    it('are not kept when the answer is an error', async () => {
      const { response } = (await ask(get('piano/loud/61.mp3?v=abc')))!;
      expect(response.status).toBe(404);
      expect(keptIn('piano')).toEqual([]);
    });

    it('of an old set are let go when the manifest names a new version', async () => {
      for (const file of ['piano/loud/60.mp3?v=old', 'piano/soft/60.mp3?v=old', 'piano/loud/60.mp3?v=new']) {
        network.has(file, 'sound');
        await ask(get(file));
      }
      network.has('piano/manifest.json', JSON.stringify({ version: 'new' }));
      await ask(get('piano/manifest.json'));
      expect(keptIn('piano')).toEqual(['piano/loud/60.mp3?v=new']);
      // The manifest itself is the app's: it is asked for anew every time.
      expect(keptIn('app')).toEqual(['piano/manifest.json']);
    });
  });

  describe('the app’s own files', () => {
    it('come from the network, so a new version shows up at once, and are kept', async () => {
      network.has('assets/app-1.js', 'first');
      expect(await text(get('assets/app-1.js'))).toBe('first');
      network.has('assets/app-1.js', 'second');
      expect(await text(get('assets/app-1.js'))).toBe('second');
      expect(await cache('app').kept.get(at('assets/app-1.js'))!.clone().text()).toBe('second');
    });

    it('come from the kept copy when the network is away', async () => {
      network.has('demos/showcase.musicxml', 'score');
      await ask(get('demos/showcase.musicxml'));
      network.offline = true;
      expect(await text(get('demos/showcase.musicxml'))).toBe('score');
    });

    it('fail as they would without the worker when the network is away and nothing is kept', async () => {
      network.offline = true;
      await expect(ask(get('demos/showcase.musicxml'))).rejects.toThrow('Failed to fetch');
    });

    it('are not kept when the answer is an error, and the kept copy stays', async () => {
      network.has('index.html', 'page');
      await ask(get('index.html'));
      network.answers.clear();
      expect((await ask(get('index.html')))!.response.status).toBe(404);
      expect(await cache('app').kept.get(at('index.html'))!.clone().text()).toBe('page');
    });
  });

  describe('the page', () => {
    it('is the one page of the app at any of its addresses when the network is away', async () => {
      network.has('', '<html>app</html>');
      await ask(get('', 'navigate'));
      network.offline = true;
      expect(await text(get('', 'navigate'))).toBe('<html>app</html>');
      expect(await text(get('some/other/address', 'navigate'))).toBe('<html>app</html>');
      // Only a page: a script at an unknown address is not answered with the page.
      await expect(ask(get('some/other/script.js'))).rejects.toThrow();
    });

    it('lets go of the old build’s scripts and styles it no longer names', async () => {
      for (const file of ['assets/app-old.js', 'assets/app-old.css', 'assets/font.woff2', 'demos/showcase.musicxml']) {
        network.has(file, 'x');
        await ask(get(file));
      }
      network.has('', '<link href="/claviano/assets/app-new.css"><link href="/claviano/assets/font.woff2"><script src="/claviano/assets/app-new.js"></script>');
      await ask(get('', 'navigate'));
      // The font is still named, the demo is not a build file: both stay.
      expect(keptIn('app')).toEqual(['', 'assets/font.woff2', 'demos/showcase.musicxml']);
    });
  });

  describe('on a slow network', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('shows the kept copy after a few seconds, and keeps the answer for next time when it comes', async () => {
      network.has('index.html', 'old');
      const first = ask(get('index.html'));
      await vi.runAllTimersAsync();
      await first;

      network.has('index.html', 'new');
      network.delay = 10_000;
      const asked = ask(get('index.html'));
      await vi.advanceTimersByTimeAsync(4000);
      const { response, settled, keptAlive } = (await asked)!;
      expect(await response.text()).toBe('old');
      expect(keptAlive).toBe(true);

      await vi.advanceTimersByTimeAsync(6000);
      await settled;
      expect(await cache('app').kept.get(at('index.html'))!.clone().text()).toBe('new');
    });

    it('answers from the network when it is quick enough', async () => {
      network.has('index.html', 'old');
      const first = ask(get('index.html'));
      await vi.runAllTimersAsync();
      await first;

      network.has('index.html', 'new');
      network.delay = 3000;
      const asked = ask(get('index.html'));
      await vi.advanceTimersByTimeAsync(3000);
      expect(await (await asked)!.response.text()).toBe('new');
    });

    it('waits for the network when there is nothing kept to show', async () => {
      network.has('index.html', 'new');
      network.delay = 10_000;
      const asked = ask(get('index.html'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await (await asked)!.response.text()).toBe('new');
    });
  });

  describe('told what the page loaded before it took over', () => {
    const tell = async (data: unknown) => {
      const waiting: Promise<unknown>[] = [];
      listeners.get('message')!({ data, waitUntil: (work: Promise<unknown>) => waiting.push(work) });
      await Promise.all(waiting);
    };

    it('fetches and keeps what it does not have yet, each in its own cache', async () => {
      network.has('', 'page');
      network.has('assets/app.js', 'script');
      network.has('piano/loud/60.mp3?v=abc', 'sound');
      network.has('piano/soft/60.mp3?v=abc', 'sound');
      await ask(get('piano/soft/60.mp3?v=abc'));
      network.requests = [];

      await tell({ type: 'keep', urls: [SCOPE, at('assets/app.js'), at('piano/loud/60.mp3?v=abc'), at('piano/soft/60.mp3?v=abc')] });
      expect(keptIn('app')).toEqual(['', 'assets/app.js']);
      expect(keptIn('piano')).toEqual(['piano/loud/60.mp3?v=abc', 'piano/soft/60.mp3?v=abc']);
      // What was kept already is not fetched again.
      expect(network.requests).not.toContain(at('piano/soft/60.mp3?v=abc'));
    });

    it('skips other sites, errors and what the network does not give', async () => {
      network.has('assets/app.js', 'script');
      await tell({ type: 'keep', urls: ['https://fonts.example.com/font.woff2', at('assets/missing.js'), at('assets/app.js')] });
      expect(keptIn('app')).toEqual(['assets/app.js']);
      expect(network.requests).not.toContain('https://fonts.example.com/font.woff2');

      network.offline = true;
      await tell({ type: 'keep', urls: [at('assets/other.js')] });
      expect(keptIn('app')).toEqual(['assets/app.js']);
    });

    it('takes no notice of other messages', async () => {
      await tell({ type: 'something else', urls: [at('assets/app.js')] });
      await tell(undefined);
      expect(network.requests).toEqual([]);
    });
  });
});
