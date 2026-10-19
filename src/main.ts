// Composition root: the only place that knows about concrete implementations.
import { createApp } from 'vue';
import { BarLoop } from './application/use-cases/BarLoop';
import { Bookmarks } from './application/use-cases/Bookmarks';
import { OwnFingering } from './application/use-cases/OwnFingering';
import { keepTake } from './application/use-cases/keepTake';
import { FreePlay } from './application/use-cases/FreePlay';
import { Library } from './application/use-cases/Library';
import { LoadScore } from './application/use-cases/LoadScore';
import { OpenScore } from './application/use-cases/OpenScore';
import { PieceMemories } from './application/use-cases/PieceMemories';
import { Playback } from './application/use-cases/Playback';
import { Recorder } from './application/use-cases/Recorder';
import { TempoTrainer } from './application/use-cases/TempoTrainer';
import { keepInstrumentPrepared } from './application/use-cases/PrepareInstrument';
import { Volume } from './application/use-cases/Volume';
import { rememberPieces } from './application/use-cases/rememberPieces';
import { restWhenPutAway } from './application/use-cases/restWhenPutAway';
import { rememberPracticeSettings } from './application/use-cases/rememberPracticeSettings';
import { odeToJoy } from './demo/odeToJoy';
import { playAsMusic } from './infrastructure/audio/audioSession';
import { SamplerPiano } from './infrastructure/audio/SamplerPiano';
import { WebAudioSynth } from './infrastructure/audio/WebAudioSynth';
import { startOfflineCache } from './infrastructure/offline/offlineCache';
import { fetchScore } from './infrastructure/parsers/fetchScore';
import { MidiFileParser } from './infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from './infrastructure/parsers/MusicXmlParser';
import { CanvasPianoRoll } from './infrastructure/render/CanvasPianoRoll';
import { CanvasPlayedTiles } from './infrastructure/render/CanvasPlayedTiles';
import { SvgStaff } from './infrastructure/render/SvgStaff';
import { IndexedDbPieceShelf } from './infrastructure/storage/IndexedDbPieceShelf';
import { LocalSettingsStore } from './infrastructure/storage/LocalSettingsStore';
import { IntervalTicker } from './infrastructure/timing/IntervalTicker';
import { MidiFileWriter } from './infrastructure/writers/MidiFileWriter';
import App from './ui/App.vue';
import { depsKey, type Demo } from './ui/deps';
import { listenForInstall } from './ui/browser/useInstall';
import { startTheme } from './ui/theme/useTheme';
import './ui/styles.css';

// The piano's samples load in the background; until they are in (or if they never are), the synth plays.
// (Before the first sound: an iPhone with its ringer off plays on.)
playAsMusic();
const audioContext = new AudioContext();
const piano = new SamplerPiano(audioContext, new WebAudioSynth(audioContext));
// In the built app a service worker keeps the samples on disk; they are fetched once it is in place.
const offline = import.meta.env.PROD ? startOfflineCache(import.meta.env.BASE_URL) : Promise.resolve();
void offline.then(() => piano.start(`${import.meta.env.BASE_URL}piano/`));

const playback = new Playback(piano, new IntervalTicker());
const volume = new Volume(piano);
rememberPracticeSettings(playback, piano, volume, new LocalSettingsStore('claviano.practice'));
const musicXml = new MusicXmlParser();
const demos: Demo[] = [
  { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
  // Fetched only when chosen; public/ files are served under the site's base path.
  { id: 'showcase', title: 'demoShowcase', load: () => fetchScore(`${import.meta.env.BASE_URL}demos/showcase.musicxml`, musicXml, 'showcase') },
];
const openScore = new OpenScore(playback, new LoadScore([new MidiFileParser(), musicXml]));
const shelf = new IndexedDbPieceShelf();
const library = new Library(shelf, openScore, playback, demos);
void library.load();
const memories = new PieceMemories(shelf);
void memories.load();
const barLoop = new BarLoop(playback);
const trainer = new TempoTrainer(playback);
const bookmarks = new Bookmarks(playback, barLoop);
const fingering = new OwnFingering(playback);
const writeDownThePlace = rememberPieces(library, memories, { playback, barLoop, trainer, bookmarks, fingering });
// The place moves on while the music plays: written down when the page is left (closed, or put away on a phone).
window.addEventListener('pagehide', writeDownThePlace);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  rest();
  writeDownThePlace();
});
if (import.meta.env.DEV) Object.assign(window, { claviano: { playback, piano, volume, library, trainer, bookmarks, fingering } });

const freePlay = new FreePlay(piano);
keepInstrumentPrepared(playback, freePlay, piano);
const recorder = new Recorder(freePlay, piano, new IntervalTicker());
const rest = restWhenPutAway(playback, recorder);
const midiWriter = new MidiFileWriter();

// The interface's own: the theme followed from the start, and the browser's offer to install heard when it comes.
startTheme();
listenForInstall();

createApp(App)
  .provide(depsKey, {
    playback,
    barLoop,
    trainer,
    bookmarks,
    fingering,
    volume,
    instrument: piano,
    openScore,
    library,
    memories,
    freePlay,
    recorder,
    keepTake: (title, fileName) => keepTake(recorder, midiWriter, library, title, fileName),
    createRoll: (canvas, colors) => new CanvasPianoRoll(canvas, colors),
    createStaff: (container) => new SvgStaff(container),
    createTiles: (canvas, colors) => new CanvasPlayedTiles(canvas, colors),
    demos,
  })
  .mount('#app');
