// Composition root: the only place that knows about concrete implementations.
import { createApp } from 'vue';
import { LoadScore } from './application/use-cases/LoadScore';
import { Playback } from './application/use-cases/Playback';
import { odeToJoy } from './demo/odeToJoy';
import { WebAudioSynth } from './infrastructure/audio/WebAudioSynth';
import { MidiFileParser } from './infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from './infrastructure/parsers/MusicXmlParser';
import { CanvasPianoRoll } from './infrastructure/render/CanvasPianoRoll';
import { SvgStaff } from './infrastructure/render/SvgStaff';
import { IntervalTicker } from './infrastructure/timing/IntervalTicker';
import App from './ui/App.vue';
import { depsKey } from './ui/deps';
import './ui/styles.css';

const playback = new Playback(new WebAudioSynth(), new IntervalTicker());
if (import.meta.env.DEV) Object.assign(window, { claviano: { playback } });

createApp(App)
  .provide(depsKey, {
    playback,
    loadScore: new LoadScore([new MidiFileParser(), new MusicXmlParser()]),
    createRoll: (canvas) => new CanvasPianoRoll(canvas),
    createStaff: (container) => new SvgStaff(container),
    demoScore: (title) => odeToJoy(title),
  })
  .mount('#app');
