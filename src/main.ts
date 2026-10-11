// Composition root: the only place that knows about concrete implementations.
import { createApp } from 'vue';
import { BarLoop } from './application/use-cases/BarLoop';
import { keepTake } from './application/use-cases/keepTake';
import { FreePlay } from './application/use-cases/FreePlay';
import { Library } from './application/use-cases/Library';
import { LoadScore } from './application/use-cases/LoadScore';
import { OpenScore } from './application/use-cases/OpenScore';
import { Playback } from './application/use-cases/Playback';
import { Recorder } from './application/use-cases/Recorder';
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
keepInstrumentPrepared(playback, piano);
const volume = new Volume(piano);
rememberPracticeSettings(playback, piano, volume, new LocalSettingsStore('claviano.practice'));
const musicXml = new MusicXmlParser();
const demos: Demo[] = [
  { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
  // Fetched only when chosen; public/ files are served under the site's base path.
  { id: 'showcase', title: 'demoShowcase', load: () => fetchScore(`${import.meta.env.BASE_URL}demos/showcase.musicxml`, musicXml, 'showcase') },
];
const openScore = new OpenScore(playback, new LoadScore([new MidiFileParser(), musicXml]));
const library = new Library(new IndexedDbPieceShelf(), openScore, playback, demos);
void library.load();
const barLoop = new BarLoop(playback);
const writeDownThePlace = rememberPieces(library, playback, barLoop);
// The place moves on while the music plays: written down when the page is left (closed, or put away on a phone).
window.addEventListener('pagehide', writeDownThePlace);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  rest();
  writeDownThePlace();
});
if (import.meta.env.DEV) Object.assign(window, { claviano: { playback, piano, volume, library } });

const freePlay = new FreePlay(piano, piano, playback);
const recorder = new Recorder(freePlay, piano, new IntervalTicker());
const rest = restWhenPutAway(playback, recorder);
const midiWriter = new MidiFileWriter();

createApp(App)
  .provide(depsKey, {
    playback,
    barLoop,
    volume,
    instrument: piano,
    openScore,
    library,
    freePlay,
    recorder,
    keepTake: (title, fileName) => keepTake(recorder, midiWriter, library, title, fileName),
    createRoll: (canvas) => new CanvasPianoRoll(canvas),
    createStaff: (container) => new SvgStaff(container),
    createTiles: (canvas) => new CanvasPlayedTiles(canvas),
    demos,
  })
  .mount('#app');
