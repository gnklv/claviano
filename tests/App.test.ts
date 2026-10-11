// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { Instrument } from '../src/application/ports/Instrument';
import type { RollView } from '../src/application/ports/RollView';
import type { StaffView } from '../src/application/ports/StaffView';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { OpenScore } from '../src/application/use-cases/OpenScore';
import { Playback } from '../src/application/use-cases/Playback';
import { Volume } from '../src/application/use-cases/Volume';
import { odeToJoy } from '../src/demo/odeToJoy';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import App from '../src/ui/App.vue';
import { depsKey } from '../src/ui/deps';
import { FakeAudio, FakeTicker } from './fakes';

/*
 * The app as a whole, with stand-ins for sound and drawing: which screen is shown, how one gets
 * from the library to a piece and back, and what a file dropped onto the window does.
 */

const view = <T>(methods: Partial<T>): T => new Proxy(methods, { get: (target, name) => (name in target ? target[name as keyof T] : () => null) }) as T;
const instrument: Instrument = { enabled: true, status: 'ready', setEnabled() {}, onChange: () => () => {}, prepare() {} };

let playback: Playback;
let volume: Volume;
let app: VueApp;
let root: HTMLElement;
/** The window's width, as the app asks about it: a phone or not. */
const screen = { phone: false, short: false, listeners: new Set<() => void>() };
const turnIntoPhone = async () => {
  screen.phone = true;
  screen.listeners.forEach((listener) => listener());
  await nextTick();
};

const text = () => root.textContent ?? '';
const onPiece = () => root.querySelector('.piece') !== null;
const button = (label: RegExp) => [...root.querySelectorAll<HTMLElement>('button, label')].find((element) => label.test(element.textContent ?? '') || label.test(element.getAttribute('aria-label') ?? ''))!;
const settled = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
const drop = async (name: string, content: string) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: { files: [new File([content], name)] } });
  root.querySelector('.app')!.dispatchEvent(event);
  await settled();
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('claviano.locale', 'en');
  location.hash = '';
  vi.spyOn(history, 'back').mockImplementation(() => {
    location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  screen.phone = false;
  screen.short = false;
  screen.listeners.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = {
      get matches() {
        return (screen.phone && query.includes('max-width: 599px')) || (screen.short && query.includes('max-height: 500px'));
      },
      addEventListener: (_: string, listener: () => void) => screen.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => screen.listeners.delete(listener),
    };
    return media as unknown as MediaQueryList;
  });
  playback = new Playback(new FakeAudio(), new FakeTicker());
  volume = new Volume(new FakeAudio());
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(App).provide(depsKey, {
    playback,
    barLoop: new BarLoop(playback),
    volume,
    instrument,
    openScore: new OpenScore(playback, new LoadScore([new MusicXmlParser()])),
    createRoll: () => view<RollView>({ secondsPerPixel: null, scrollable: false }),
    createStaff: () => view<StaffView>({}),
    demos: [
      { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
      { id: 'lost', title: 'demoShowcase', load: () => Promise.reject(new Error('HTTP 404')) },
    ],
  });
  app.mount(root);
});

afterEach(() => {
  app.unmount();
  root.remove();
  vi.restoreAllMocks();
  location.hash = '';
});

describe('the app', () => {
  it('starts in the library: a file to open, the demos, and a word about dropping a file', () => {
    expect(onPiece()).toBe(false);
    expect(text()).toContain('Open file');
    expect(text()).toContain('Ode to Joy');
    expect(text()).toContain('drop a file');
    expect(root.querySelector('input[type=file]')).not.toBeNull();
  });

  it('opens a demo into the piece screen, under an address of its own, with the piece named in the header', async () => {
    button(/Ode to Joy/).click();
    await settled();
    expect(onPiece()).toBe(true);
    expect(location.hash).toBe('#/piece');
    expect(root.querySelector('.title')?.textContent).toMatch(/^Ode to Joy · 8 bars · \d+ notes$/);
    // Opening files and demos is the library's business: the piece's header has neither.
    expect(root.querySelector('input[type=file]')).toBeNull();
  });

  it('goes back to the library by the arrow, and the music stops', async () => {
    button(/Ode to Joy/).click();
    await settled();
    await playback.play();
    expect(playback.playing).toBe(true);

    button(/Back to the library/).click();
    await settled();
    expect(onPiece()).toBe(false);
    expect(location.hash).toBe('#/');
    expect(playback.playing).toBe(false);
  });

  it('goes back to the library by the browser’s Back, and to the piece again by Forward', async () => {
    button(/Ode to Joy/).click();
    await settled();
    location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));
    await settled();
    expect(onPiece()).toBe(false);

    location.hash = '#/piece';
    window.dispatchEvent(new Event('hashchange'));
    await settled();
    expect(onPiece()).toBe(true);
  });

  it('says in the library what did not open, and stays there', async () => {
    button(/Showcase/).click();
    await settled();
    expect(onPiece()).toBe(false);
    expect(root.querySelector('[role=alert]')?.textContent).toMatch(/Showcase.*unexpected error/);

    await drop('photo.jpg', 'not music');
    expect(root.querySelector('[role=alert]')?.textContent).toMatch(/photo\.jpg.*not supported/);
    // A piece that opens clears it.
    button(/Ode to Joy/).click();
    await settled();
    button(/Back to the library/).click();
    await settled();
    expect(root.querySelector('[role=alert]')).toBeNull();
  });

  it('opens a file dropped onto the window from either screen', async () => {
    const xml = (title: string) =>
      `<?xml version="1.0"?><score-partwise><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;
    await drop('first.musicxml', xml('First'));
    expect(onPiece()).toBe(true);
    expect(root.querySelector('.title')?.textContent).toContain('First');

    await drop('second.musicxml', xml('Second'));
    expect(root.querySelector('.title')?.textContent).toContain('Second');
    // A file that does not open leaves the piece where it is, and says so in the header.
    await drop('photo.jpg', 'not music');
    expect(onPiece()).toBe(true);
    expect(root.querySelector('.title[role=alert]')?.textContent).toMatch(/photo\.jpg/);
    expect(playback.score?.title).toBe('Second');
  });

  describe('the settings panel', () => {
    const panel = () => root.querySelector<HTMLDialogElement>('dialog')!;
    const labels = () => [...panel().querySelectorAll('.label')].map((label) => label.textContent);

    it('opens from the gear on either screen, and closes by its cross', async () => {
      expect(panel().open).toBe(false);
      button(/^Settings$/).click();
      await settled();
      expect(panel().open).toBe(true);
      button(/^Close$/).click();
      await settled();
      expect(panel().open).toBe(false);
    });

    it('has in the library what goes for any piece: the sound, how loud it is, the theme, the language', () => {
      expect(labels()).toEqual(['Sound', 'Notes volume', 'Metronome volume', 'Theme', 'Language']);
    });

    it('has on the piece screen the view as well', async () => {
      button(/Ode to Joy/).click();
      await settled();
      expect(labels()).toEqual(['View', 'Sound', 'Notes volume', 'Metronome volume', 'Theme', 'Language']);
    });

    it('turns the notes down from its slider', async () => {
      const slider = panel().querySelector<HTMLInputElement>('input[type=range]')!;
      slider.value = '40';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await settled();
      expect(volume.of('instrument')).toBe(0.4);
      expect(panel().querySelector('output')?.textContent).toBe('40%');
    });
  });

  it('plays and steps by bars from the keyboard on the piece screen only', async () => {
    const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    press('Space');
    await settled();
    expect(playback.playing).toBe(false);

    button(/Ode to Joy/).click();
    await settled();
    press('ArrowRight');
    expect(playback.position).toBeCloseTo(playback.score!.bars[1]);
    press('Space');
    await settled();
    expect(playback.playing).toBe(true);
  });

  describe('a phone on its side', () => {
    const immersed = () => root.querySelector('.piece')!.classList.contains('immersed');
    const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const touch = (selector: string) => root.querySelector(selector)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    beforeEach(async () => {
      button(/Ode to Joy/).click();
      await settled();
      screen.short = true;
      screen.listeners.forEach((listener) => listener());
      await nextTick();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => vi.useRealTimers());

    it('keeps what is set once a session behind "⋯", and offers the staff or the keys, not both', () => {
      const bar = root.querySelector('.transport')!;
      expect([...bar.querySelectorAll('button[aria-pressed]')].filter((element) => !element.closest('dialog'))).toHaveLength(1);
      expect(button(/^Practice$/)).toBeDefined();
      expect([...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')]).toHaveLength(2);
    });

    it('gives the screen to the music while it plays: the header and the transport go three seconds after the last touch', async () => {
      await vi.advanceTimersByTimeAsync(5000);
      expect(immersed()).toBe(false);

      press('Space');
      await vi.advanceTimersByTimeAsync(2900);
      expect(immersed()).toBe(false);
      touch('.transport');
      await vi.advanceTimersByTimeAsync(2900);
      expect(immersed()).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(immersed()).toBe(true);
      expect(root.querySelector('.waker')).not.toBeNull();
    });

    it('brings them back at a touch, and for good when the music stops', async () => {
      press('Space');
      await vi.advanceTimersByTimeAsync(3100);
      expect(immersed()).toBe(true);

      touch('.waker');
      await vi.advanceTimersByTimeAsync(0);
      expect(immersed()).toBe(false);
      expect(root.querySelector('.waker')).toBeNull();
      await vi.advanceTimersByTimeAsync(3100);
      expect(immersed()).toBe(true);

      press('Space');
      await vi.advanceTimersByTimeAsync(0);
      expect(immersed()).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(immersed()).toBe(false);
    });

    it('does not take them from under an open panel', async () => {
      press('Space');
      await vi.advanceTimersByTimeAsync(0);
      button(/^Settings$/).click();
      await vi.advanceTimersByTimeAsync(4000);
      expect(immersed()).toBe(false);
      button(/^Close$/).click();
      await vi.advanceTimersByTimeAsync(3100);
      expect(immersed()).toBe(true);
    });

    it('is not so on a screen of full height', async () => {
      screen.short = false;
      screen.listeners.forEach((listener) => listener());
      press('Space');
      await vi.advanceTimersByTimeAsync(5000);
      expect(immersed()).toBe(false);
    });
  });

  describe('the view', () => {
    const views = () => [...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')];
    const stage = () => root.querySelector('.stage')!;

    beforeEach(async () => {
      button(/Ode to Joy/).click();
      await settled();
    });

    it('is the staff, the keys or both', async () => {
      expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys', 'Both']);
      views()[2].click();
      await settled();
      expect(stage().classList.contains('view-both')).toBe(true);
    });

    it('is not both on a phone held upright: the keys are shown, and the choice comes back with the room', async () => {
      views()[2].click();
      await settled();
      await turnIntoPhone();
      expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys']);
      expect(stage().classList.contains('view-keys')).toBe(true);

      screen.phone = false;
      screen.listeners.forEach((listener) => listener());
      await nextTick();
      expect(stage().classList.contains('view-both')).toBe(true);
      views()[1].click();
      await settled();
    });
  });

  it('makes the tempo a step slower or faster by − and +, and the piece’s own again by 0', async () => {
    const press = (code: string, more = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...more }));
    button(/Ode to Joy/).click();
    await settled();
    press('Minus');
    press('Minus');
    expect(playback.tempo).toBe(0.9);
    press('Equal');
    expect(playback.tempo).toBe(0.95);
    press('Digit0');
    expect(playback.tempo).toBe(1);
    // Cmd and − is the browser's own: zooming out.
    press('Minus', { metaKey: true });
    expect(playback.tempo).toBe(1);
  });

  it('goes back to the start by Home, and goes on playing', async () => {
    const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    button(/Ode to Joy/).click();
    await settled();
    press('ArrowRight');
    press('ArrowRight');
    press('Space');
    await settled();
    press('Home');
    expect(playback.position).toBeCloseTo(0);
    expect(playback.playing).toBe(true);
  });

  describe('the transport bar', () => {
    const bar = () => root.querySelector<HTMLElement>('.transport')!;
    const chip = (label: RegExp) => [...bar().querySelectorAll<HTMLElement>('button')].find((element) => label.test(element.textContent ?? ''))!;

    beforeEach(async () => {
      button(/Ode to Joy/).click();
      await settled();
    });

    it('has what is set once a session beside what is always at hand: the hands, the metronome, the count-in, the pedal', () => {
      const pressable = [...bar().querySelectorAll('button[aria-pressed]')].map((element) => element.textContent?.trim());
      expect(pressable).toEqual(['↻ Loop', 'Right', 'Left', 'Metronome', 'Count-in', 'Pedal']);
    });

    it('turns the count-in and the pedal on and off', async () => {
      for (const [label, read] of [[/Count-in/, () => playback.countInEnabled], [/Pedal/, () => playback.pedalEnabled]] as const) {
        const before = read();
        chip(label).click();
        await settled();
        expect(read()).toBe(!before);
        expect(chip(label).getAttribute('aria-pressed')).toBe(String(!before));
      }
    });

    it('keeps on a phone what is set once a session in a sheet behind "⋯"', async () => {
      await turnIntoPhone();
      const sheet = () => bar().querySelector<HTMLDialogElement>('dialog[aria-label=Practice]')!;
      const inBar = [...bar().querySelectorAll('button[aria-pressed]')].filter((element) => !element.closest('dialog'));
      expect(inBar.map((element) => element.textContent?.trim())).toEqual(['↻ Loop']);
      expect(sheet().open).toBe(false);

      button(/^Practice$/).click();
      await settled();
      expect(sheet().open).toBe(true);
      expect([...sheet().querySelectorAll('button[aria-pressed]')].map((element) => element.textContent?.trim())).toEqual(['Right', 'Left', 'Metronome', 'Count-in', 'Pedal']);

      const before = playback.pedalEnabled;
      chip(/Pedal/).click();
      expect(playback.pedalEnabled).toBe(!before);
    });

    it('has no button for going back to the start: Home does that', () => {
      const plain = [...bar().querySelectorAll('button')].filter((element) => !element.hasAttribute('aria-pressed'));
      expect(plain.map((element) => element.getAttribute('aria-label'))).toEqual(['Play', 'Tempo: 100%']);
    });

    describe('the tempo', () => {
      const tempoPanel = () => bar().querySelector<HTMLElement>('[role=group][aria-label=Tempo]');

      it('is a button that says what it is, and opens a panel for setting it; Esc or a press elsewhere closes it', async () => {
        expect(tempoPanel()).toBeNull();
        button(/^Tempo: 100%$/).click();
        await settled();
        expect(tempoPanel()).not.toBeNull();

        window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        // (It fades out first.)
        await vi.waitFor(() => expect(tempoPanel()).toBeNull());

        button(/^Tempo: 100%$/).click();
        await settled();
        tempoPanel()!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await settled();
        expect(tempoPanel()).not.toBeNull();
        root.querySelector('.stage')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        // (It fades out first.)
        await vi.waitFor(() => expect(tempoPanel()).toBeNull());
      });

      it('is set by a step slower or faster, or straight to one of the tempos pieces are learned at', async () => {
        button(/^Tempo: 100%$/).click();
        await settled();
        const presets = () => [...tempoPanel()!.querySelectorAll('button[aria-pressed]')];
        expect(presets().map((element) => element.textContent?.trim())).toEqual(['50', '60', '70', '80', '90', '100']);

        button(/^Slower$/).click();
        await settled();
        expect(playback.tempo).toBe(0.95);
        expect(tempoPanel()!.querySelector('output')?.textContent).toContain('95%');
        expect(presets().filter((element) => element.getAttribute('aria-pressed') === 'true')).toHaveLength(0);

        chip(/^\s*70\s*$/).click();
        await settled();
        expect(playback.tempo).toBe(0.7);
        expect(button(/^Tempo: 70%$/)).toBeDefined();

        button(/^Faster$/).click();
        expect(playback.tempo).toBe(0.75);
      });

      it('is in a sheet on a phone', async () => {
        await turnIntoPhone();
        const sheet = bar().querySelector<HTMLDialogElement>('dialog[aria-label=Tempo]')!;
        expect(sheet.open).toBe(false);
        button(/^Tempo: 100%$/).click();
        await settled();
        expect(sheet.open).toBe(true);
        expect(sheet.querySelectorAll('button[aria-pressed]')).toHaveLength(6);
      });
    });
  });
});
