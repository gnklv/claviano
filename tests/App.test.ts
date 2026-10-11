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
const screen = { phone: false, listeners: new Set<() => void>() };
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
  screen.listeners.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = {
      get matches() {
        return screen.phone && query.includes('max-width: 599px');
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
      const sheet = () => bar().querySelector<HTMLDialogElement>('dialog')!;
      const inBar = [...bar().querySelectorAll('button[aria-pressed]')].filter((element) => !sheet().contains(element));
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
      expect([...bar().querySelectorAll('button')].filter((element) => !element.hasAttribute('aria-pressed'))).toHaveLength(1);
    });
  });
});
