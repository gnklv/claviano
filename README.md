# Claviano

A self-written web player for learning piano pieces: open a MIDI file, watch the notes fall onto
the keyboard, slow it down, loop the hard bars, practice one hand at a time.

**Try it:** https://gnklv.github.io/claviano/

The core (parsing, playback, audio, canvas) is written from scratch in plain TypeScript;
the UI shell is Vue 3. Notes are named in fixed-do solfège (Do, Re, Mi, Fa, Sol, La, Si)
with scientific octave numbers: `pitch('Do', 4)` is middle Do (MIDI 60).

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Every push to `master` runs the tests, builds and deploys to GitHub Pages
(`.github/workflows/deploy.yml`).

**Showcase.** "Demo → Showcase" opens a short score that uses every feature the staff and
playback support (pickup, all note values, beams, accidentals, tuplets, voices, rests, ties,
key/time/clef/tempo/dynamics changes, a wide range, articulations, fermatas, slurs, the sustain
pedal, repeats with voltas and D.S. al Coda). It is built by `scripts/showcase.ts`
(`npm run showcase` rewrites `public/demos/showcase.musicxml`) and checked end to end by
`tests/showcase.test.ts`. When you add a feature, add a bar to the showcase.

## Controls

| | |
|---|---|
| Space | play / pause |
| ← → | previous / next bar |
| Tempo | 25–150%, pitch is unaffected |
| Right / Left | mute a hand (it is still shown, dimmed) |
| Bar loop | repeat bars *from–to* seamlessly |
| ⚙ → Pedal | play the score's sustain pedal or not (to hear the fingers alone) |

Drag a MIDI (`.mid`) or uncompressed MusicXML (`.musicxml`) file onto the window, or use
"Open file". In MuseScore, export as *Uncompressed MusicXML*; compressed `.mxl` is not read.

## Architecture

Clean architecture: dependencies point inwards only.

```
src/
  domain/            Note, Score, solfège pitch helpers. No dependencies. Notes carry two clocks:
                     seconds (playback) and beats in quarter notes (notation); scores carry
                     time and key signatures, and two timelines: bars as played (repeats
                     unrolled) and bars as printed, linked by barWritten. The sustain pedal
                     (pedal.ts) is kept beside the notes, which keep the length of the key.
    notation/          Music theory for the staff: spelling (Fa♯ or Sol♭), accidentals per bar,
                       note values (quarter, dotted eighth…), quantization to a 1/32 grid,
                       and navigation: the performance order of repeats and jumps.
  application/
    ports/           AudioOutput, Ticker, ScoreParser — interfaces the core needs.
    use-cases/       Playback (tempo, loop, hands, pedal), LoadScore.
  infrastructure/    Implementations of the ports:
    parsers/           MidiFileParser — Standard MIDI File reader written from scratch
                       (sustain pedal from controller 64).
                       MusicXmlParser — uncompressed MusicXML (.musicxml/.xml) via DOMParser:
                       sounding notes for playback (ties merged) and the notes as printed
                       (value, tuplet, accidental, stem, beams, clef, pedal) for the staff.
    audio/             WebAudioSynth — additive synth with a piano-like envelope.
    timing/            IntervalTicker.
    render/            CanvasPianoRoll — falling notes + keyboard on Canvas 2D, showing only
                       the octaves the piece uses (keyboardRange). When keys would get too
                       narrow, the keyboard scrolls and a lazy camera follows the music
                       (keyboardCamera); swipe or Shift+wheel to look around. Pedal moves
                       fall as plain labels ("Pedal ↓", "Pedal ↑", "Pedal ↑↓").
                       SvgStaff — grand staff as a tape scrolling under a fixed cursor, with
                       the key and time signatures in force at the cursor (staffLayout) and
                       the notes laid out by notationLayout (as written for MusicXML,
                       inferred for MIDI) and beamed by beams.ts; sounding notes light up.
                       Pedal marks ("Ped." / "✱" or a bracket line) come from pedalLayout.
  ui/                Vue 3 shell: App.vue, components/, composables/. Calls use cases only;
                     per-frame work (canvas, position readout) bypasses reactivity.
    i18n/              Own tiny i18n: en.ts defines the keys, ru.ts must provide all of them
                       (checked by TypeScript). Plurals via Intl.PluralRules. Note labels:
                       C4 in English, До1 in Russian (Russian octave numbering).
    theme/             Auto / light / dark. All colors are CSS variables in styles.css;
                       the SVG staff uses them directly, the canvas reads them on switch.
  demo/              Built-in "Ode to Joy" for trying the player without a file.
  main.ts            Composition root.
tests/               Use cases tested with fake audio/ticker; parser tested with hand-built MIDI.
```

Playback schedules notes ~200 ms ahead on the Web Audio clock, so timing does not depend on
timer jitter; the view only reads `playback.position` each frame.

## Roadmap

- [ ] Sampled piano (e.g. Salamander Grand Piano) behind `AudioOutput`
- [ ] Web MIDI input and "wait mode"
- [x] MusicXML parser, stage 1: play and show uncompressed MusicXML
- [x] MusicXML stage 2: staff as written (values, tuplets, accidentals, stems, beams, clef changes)
- [x] Stage 3: rests (placement rules, whole-bar rests, two voices) and tie arcs (MusicXML)
- [x] Stage 4: articulations (staccato, staccatissimo, tenuto, portato, accent, marcato), fermatas
      and slurs from MusicXML; staccato plays shorter, accents louder
- [x] Repeats, voltas, D.C., D.S., Fine, Coda (MusicXML): played in performance order, the staff
      tape shows the page and glides back on repeats; fermatas are held
- [x] Sustain pedal (MIDI CC 64, MusicXML): held notes ring on, "Ped." / "✱" signs or a bracket
      under the staff; in the falling notes, plain labels (Pedal ↓ / ↑ / ↑↓) falling where the foot
      moves and three pedals in the corner, the right one lit while held; an on/off switch
- [x] View modes: staff / falling notes / both
- [x] Light and dark themes, following the system by default
- [x] Notes on the staff, level 1: heads, stems, flags, dots, ledger lines, accidentals
- [x] Beams: grouped by beat (by three eighths in 3/8, 6/8…), with stubs and stacked levels
- [ ] Notes on the staff, level 2: chord seconds, durations from the next note (ties and rests
      are done)
