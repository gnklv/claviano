import { afterEach, beforeEach, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { RollView } from '../../src/application/ports/RollView';
import type { StaffView } from '../../src/application/ports/StaffView';
import type { PlayedTile, TilesView } from '../../src/application/ports/TilesView';
import { BarLoop } from '../../src/application/use-cases/BarLoop';
import { Bookmarks } from '../../src/application/use-cases/Bookmarks';
import { keepTake } from '../../src/application/use-cases/keepTake';
import { FreePlay } from '../../src/application/use-cases/FreePlay';
import { keepInstrumentPrepared } from '../../src/application/use-cases/PrepareInstrument';
import { Library } from '../../src/application/use-cases/Library';
import { PieceMemories } from '../../src/application/use-cases/PieceMemories';
import { LoadScore } from '../../src/application/use-cases/LoadScore';
import { OpenScore } from '../../src/application/use-cases/OpenScore';
import { Playback } from '../../src/application/use-cases/Playback';
import { Recorder } from '../../src/application/use-cases/Recorder';
import { TempoTrainer } from '../../src/application/use-cases/TempoTrainer';
import { rememberPieces } from '../../src/application/use-cases/rememberPieces';
import { Volume } from '../../src/application/use-cases/Volume';
import { odeToJoy } from '../../src/demo/odeToJoy';
import type { Score } from '../../src/domain/score';
import { MidiFileParser } from '../../src/infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from '../../src/infrastructure/parsers/MusicXmlParser';
import { MidiFileWriter } from '../../src/infrastructure/writers/MidiFileWriter';
import App from '../../src/ui/App.vue';
import { depsKey } from '../../src/ui/deps';
import { rereadPreferences } from '../../src/ui/preferences';
import { listenForInstall } from '../../src/ui/install/useInstall';
import { startTheme } from '../../src/ui/theme/useTheme';
import { FakeAudio, FakeInstrument, FakePieceShelf, FakeTicker, fakeView } from '../fakes';

/*
 * The app as a whole, for its tests: mounted with stand-ins for sound, drawing and storage, started
 * afresh for each test. A test file calls `useApp()` once, and reads what it needs from here: the
 * use cases, what the stand-ins were given, and helpers that act as a person would (press a
 * button, drop a file).
 */

const instrument = new FakeInstrument();

export let playback: Playback;
export let bookmarks: Bookmarks;
export let volume: Volume;
export let app: VueApp;
export let shelf: FakePieceShelf;
/** What sounds: the piece's notes, and the keys struck by hand. */
export let audio: FakeAudio;
/** What the staff was told to show, each time it was told. */
export let staffScores: (Score | null)[];
/** The tiles of free play, as last handed to their view. */
export let tilesShown: readonly PlayedTile[];
/** Starts the app, as a page loaded at the address that stands: with the shelf as it was left. */
export let start: () => void;
export let root: HTMLElement;
let stopListeningForInstall: () => void;
/** The window's width, as the app asks about it: a phone or not. */
export const screen = { phone: false, short: false, touch: false, listeners: new Set<() => void>() };
export const turnIntoPhone = async () => {
  screen.phone = true;
  screen.listeners.forEach((listener) => listener());
  await nextTick();
};

export const text = () => root.textContent ?? '';
export const onPiece = () => root.querySelector('.piece') !== null;
export const button = (label: RegExp) => [...root.querySelectorAll<HTMLElement>('button, label')].find((element) => label.test(element.textContent ?? '') || label.test(element.getAttribute('aria-label') ?? ''))!;
export const settled = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
export const drop = async (name: string, content: string) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: { files: [new File([content], name)] } });
  root.querySelector('.app')!.dispatchEvent(event);
  await settled();
};

/** A piece of one bar as MusicXML, under a title: a file to open. */
export const xml = (title: string) =>
  `<?xml version="1.0"?><score-partwise><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;

/** The page is loaded again, at the address that stands, with the shelf as it was left. */
export const restart = async () => {
  app.unmount();
  root.remove();
  start();
  await settled();
};

/** Sets the app up before each test of the file, and takes it down after. */
export function useApp(): void {
  beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('claviano.locale', 'en');
  // (The interface's choices are read once and kept: read again, as a page just loaded would.)
  rereadPreferences();
  location.hash = '';
  vi.spyOn(history, 'back').mockImplementation(() => {
    location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  screen.phone = false;
  screen.short = false;
  screen.touch = false;
  screen.listeners.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = {
      get matches() {
        return (
          (screen.phone && query.includes('max-width: 599px')) || (screen.short && query.includes('max-height: 500px')) || (screen.touch && query.includes('pointer: coarse'))
        );
      },
      addEventListener: (_: string, listener: () => void) => screen.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => screen.listeners.delete(listener),
    };
    return media as unknown as MediaQueryList;
  });
  // (The theme and the browser's word on installing: afresh, as on a page just loaded.)
  startTheme();
  stopListeningForInstall = listenForInstall();
  shelf = new FakePieceShelf();
  start = () => {
    audio = new FakeAudio();
    staffScores = [];
    tilesShown = [];
    playback = new Playback(audio, new FakeTicker());
    volume = new Volume(new FakeAudio());
    root = document.createElement('div');
    document.body.append(root);
    const demos = [
      { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
      { id: 'lost', title: 'demoShowcase', load: () => Promise.reject(new Error('HTTP 404')) },
    ] as const;
    const openScore = new OpenScore(playback, new LoadScore([new MusicXmlParser(), new MidiFileParser()]));
    const library = new Library(shelf, openScore, playback, demos);
    void library.load();
    const memories = new PieceMemories(shelf);
    void memories.load();
    const barLoop = new BarLoop(playback);
    const trainer = new TempoTrainer(playback);
    bookmarks = new Bookmarks(playback, barLoop);
    rememberPieces(library, memories, { playback, barLoop, trainer, bookmarks });
    const freePlay = new FreePlay(audio);
    keepInstrumentPrepared(playback, freePlay, instrument);
    const recorder = new Recorder(freePlay, audio, new FakeTicker());
    app = createApp(App).provide(depsKey, {
      playback,
      barLoop,
      trainer,
      bookmarks,
      volume,
      instrument,
      openScore,
      library,
      memories,
      freePlay,
      recorder,
      keepTake: (title, fileName) => keepTake(recorder, new MidiFileWriter(), library, title, fileName),
      createRoll: () => fakeView<RollView>({ secondsPerPixel: null, scrollable: false }),
      createStaff: () => fakeView<StaffView>({ setScore: (score) => void staffScores.push(score) }),
      createTiles: () => fakeView<TilesView>({ secondsInSight: 5, render: (frame) => void (tilesShown = frame.tiles) }),
      demos,
    });
    app.mount(root);
  };
  start();
});

afterEach(() => {
  app.unmount();
  root.remove();
  stopListeningForInstall();
  vi.restoreAllMocks();
  location.hash = '';
});
}
