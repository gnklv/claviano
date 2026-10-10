// Composition root: the only place that knows about concrete implementations.
import { createApp } from 'vue';
import { BarLoop } from './application/use-cases/BarLoop';
import { LoadScore } from './application/use-cases/LoadScore';
import { OpenScore } from './application/use-cases/OpenScore';
import { Playback } from './application/use-cases/Playback';
import { keepInstrumentPrepared } from './application/use-cases/PrepareInstrument';
import { Volume } from './application/use-cases/Volume';
import { rememberPracticeSettings } from './application/use-cases/rememberPracticeSettings';
import { odeToJoy } from './demo/odeToJoy';
import { SamplerPiano } from './infrastructure/audio/SamplerPiano';
import { WebAudioSynth } from './infrastructure/audio/WebAudioSynth';
import { startOfflineCache } from './infrastructure/offline/offlineCache';
import { fetchScore } from './infrastructure/parsers/fetchScore';
import { MidiFileParser } from './infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from './infrastructure/parsers/MusicXmlParser';
import { CanvasPianoRoll } from './infrastructure/render/CanvasPianoRoll';
import { SvgStaff } from './infrastructure/render/SvgStaff';
import { LocalSettingsStore } from './infrastructure/storage/LocalSettingsStore';
import { IntervalTicker } from './infrastructure/timing/IntervalTicker';
import App from './ui/App.vue';
import { depsKey } from './ui/deps';
import './ui/styles.css';

// The piano's samples load in the background; until they are in (or if they never are), the synth plays.
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
if (import.meta.env.DEV) Object.assign(window, { claviano: { playback, piano, volume } });

createApp(App)
  .provide(depsKey, {
    playback,
    barLoop: new BarLoop(playback),
    volume,
    instrument: piano,
    openScore: new OpenScore(playback, new LoadScore([new MidiFileParser(), musicXml])),
    createRoll: (canvas) => new CanvasPianoRoll(canvas),
    createStaff: (container) => new SvgStaff(container),
    demos: [
      { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
      // Fetched only when chosen; public/ files are served under the site's base path.
      { id: 'showcase', title: 'demoShowcase', load: () => fetchScore(`${import.meta.env.BASE_URL}demos/showcase.musicxml`, musicXml, 'showcase') },
    ],
  })
  .mount('#app');
