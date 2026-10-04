// Composition root: the only place that knows about concrete implementations.
import { createApp } from 'vue';
import { LoadScore } from './application/use-cases/LoadScore';
import { Playback } from './application/use-cases/Playback';
import { odeToJoy } from './demo/odeToJoy';
import { SamplerPiano } from './infrastructure/audio/SamplerPiano';
import { WebAudioSynth } from './infrastructure/audio/WebAudioSynth';
import { MidiFileParser } from './infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from './infrastructure/parsers/MusicXmlParser';
import { CanvasPianoRoll } from './infrastructure/render/CanvasPianoRoll';
import { SvgStaff } from './infrastructure/render/SvgStaff';
import { IntervalTicker } from './infrastructure/timing/IntervalTicker';
import App from './ui/App.vue';
import { depsKey } from './ui/deps';
import './ui/styles.css';

// The piano's samples load in the background; until they are in (or if they never are), the synth plays.
const audioContext = new AudioContext();
const piano = new SamplerPiano(audioContext, new WebAudioSynth(audioContext));
piano.load(`${import.meta.env.BASE_URL}piano/`).catch((error: unknown) => console.warn('Piano samples not loaded; playing the synth.', error));

const playback = new Playback(piano, new IntervalTicker());
const musicXml = new MusicXmlParser();
if (import.meta.env.DEV) Object.assign(window, { claviano: { playback, piano } });

createApp(App)
  .provide(depsKey, {
    playback,
    loadScore: new LoadScore([new MidiFileParser(), musicXml]),
    createRoll: (canvas) => new CanvasPianoRoll(canvas),
    createStaff: (container) => new SvgStaff(container),
    demos: [
      { id: 'ode', title: 'demoOde', load: () => odeToJoy('Ode to Joy') },
      {
        id: 'showcase',
        title: 'demoShowcase',
        // Fetched only when chosen; public/ files are served under the site's base path.
        load: async () => {
          const response = await fetch(`${import.meta.env.BASE_URL}demos/showcase.musicxml`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return musicXml.parse(await response.arrayBuffer(), 'showcase');
        },
      },
    ],
  })
  .mount('#app');
