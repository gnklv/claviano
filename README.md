# Claviano

A self-written web player for learning piano pieces: open a MIDI file, watch the notes fall onto
the keyboard, slow it down, loop the hard bars, practice one hand at a time.

The core (parsing, playback, audio, canvas) is written from scratch in plain TypeScript;
the UI shell is Vue 3. Notes are named in fixed-do solfège (Do, Re, Mi, Fa, Sol, La, Si)
with scientific octave numbers: `pitch('Do', 4)` is middle Do (MIDI 60).

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

## Controls

| | |
|---|---|
| Space | play / pause |
| ← → | previous / next bar |
| Tempo | 25–150%, pitch is unaffected |
| Right / Left | mute a hand (it is still shown, dimmed) |
| Bar loop | repeat bars *from–to* seamlessly |

Drag a `.mid` file onto the window or use "Открыть MIDI".

## Architecture

Clean architecture: dependencies point inwards only.

```
src/
  domain/            Note, Score, solfège pitch helpers. No dependencies.
  application/
    ports/           AudioOutput, Ticker, ScoreParser — interfaces the core needs.
    use-cases/       Playback (tempo, loop, hands), LoadScore.
  infrastructure/    Implementations of the ports:
    parsers/           MidiFileParser — Standard MIDI File reader written from scratch.
    audio/             WebAudioSynth — additive synth with a piano-like envelope.
    timing/            IntervalTicker.
    render/            CanvasPianoRoll — falling notes + 88-key keyboard on Canvas 2D.
  ui/                Vue 3 shell: App.vue, components/, composables/. Calls use cases only;
                     per-frame work (canvas, position readout) bypasses reactivity.
  demo/              Built-in "Ode to Joy" for trying the player without a file.
  main.ts            Composition root.
tests/               Use cases tested with fake audio/ticker; parser tested with hand-built MIDI.
```

Playback schedules notes ~200 ms ahead on the Web Audio clock, so timing does not depend on
timer jitter; the view only reads `playback.position` each frame.

## Roadmap

- [ ] Sampled piano (e.g. Salamander Grand Piano) behind `AudioOutput`
- [ ] Sustain pedal from MIDI CC 64
- [ ] Web MIDI input and "wait mode"
- [ ] MusicXML parser
- [ ] Own staff notation renderer (SVG + Bravura/SMuFL)
