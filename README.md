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
playback support (pickup, all note values, beams, accidentals, tuplets, voices, rests, ties, grace notes, ornaments, tremolos, rolled chords,
key/time/clef/tempo/dynamics changes, hairpins, a wide range, articulations, fermatas, slurs, the sustain
pedal and the soft and sostenuto pedals, repeats with voltas and D.S. al Coda). It is built by `scripts/showcase.ts`
(`npm run showcase` rewrites `public/demos/showcase.musicxml`) and checked end to end by
the `tests/showcase*.test.ts` files. When you add a feature, add a bar to the showcase.

**Reference copies.** `tests/snapshots/` holds what the showcase comes out as: its score (notes as
played and as written) and its engraving, one line per note, chord or mark. `tests/snapshot.test.ts`
compares against them, so any change in reading, playing or engraving shows up line by line. A
change that is meant is accepted with `npm run test:accept`, and the commit shows what changed.

**Piano sound.** The samples in `public/piano` come from the
[Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) (a Yamaha C5)
by Alexander Holm, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
They were changed for the web: three of the sixteen loudness layers and the sounds of keys and the
pedal coming up, tails shortened to 12 seconds, converted to MP3. `scripts/samples.ts` (`npm run samples`) rebuilds them from the original.

**Metronome.** Its clicks, in `public/piano/metronome`, are cut from
[a recording of a metronome](https://freesound.org/people/djfroyd/sounds/262867/) by djfroyd, in
the public domain ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)): a higher click for
the first beat of a bar, a lower one for the others. `scripts/metronome.ts`
(`npm run metronome`) cuts them from the recording. (With the synth chosen as the sound, the
metronome is a synth's blip.)

## Controls

| | |
|---|---|
| Space | play / pause |
| ← → | previous / next bar |
| Home | back to the start (of the loop, when one is on) |
| A S D F… and W E T Y… | in free play: the white and the black keys, from the lowest Do shown |
| Z X | in free play: the keyboard an octave lower / higher |
| − + 0 | tempo: a step (5%) slower / faster / back to the piece's own |
| Tempo | 25–150%, pitch is unaffected; the tempo it makes is shown beside it (♩ = 45). The button opens a panel: − and + by a step, a slider, and 50–100% a touch away |
| Right / Left | mute a hand (it is still shown, dimmed) |
| Bar loop | repeat bars *from–to* seamlessly |
| Click on the staff or the notes | jump there (a click outside the loop turns the loop off) |
| Drag the staff or the notes | look ahead or back while the music plays on; the view returns after 3 s of playing |
| Shift+drag on the staff (long press on a phone) | loop those bars |
| Metronome | a click on every beat (6/8 by dotted quarters), the first of a bar accented |
| ⚙ → Pedal | play the score's pedals or not (to hear the fingers alone) |
| ⚙ → Count-in | count the beats leading in before playing ("1 2 3" before a pickup on 4) |

Drag a MIDI (`.mid`) or MusicXML file (`.musicxml`, or compressed `.mxl`) onto the window, or use
"Open file".

## Architecture

Clean architecture: dependencies point inwards only.

```
src/
  domain/            Note, Score, solfège pitch helpers. No dependencies. A score is a piece
                     twice over. As played: notes with two clocks (seconds for playback, beats
                     in quarter notes), bars in the order they are played (repeats unrolled),
                     the three pedals (pedal.ts) and a time map (beat → second, with tempo
                     changes and fermatas), which also places the metronome's clicks and the
                     count-in (metronome.ts). And as printed: score.notation, each bar once,
                     linked to the played bars by barWritten. Every score has both: a notation
                     file is played by the domain, a performance is written down by it.
    notation/          Music theory, independent of file formats and of drawing.
                       notation.ts — the notation of a piece: everything printed on its pages
                       (notes, rests, signatures, marks), as a reader of any format fills it in.
                       performance.ts — performNotation: playing what is written. Grace notes
                       and ornaments as quick notes (grace.ts, ornaments.ts), articulation and
                       dynamics as length and loudness (dynamics.ts), ties, fermatas, repeats
                       and jumps (navigation.ts), tempo and pedal marks as time.
                       transcription.ts — transcribe: writing down what was played (a MIDI
                       file): quantization to a 1/32 grid, note values up to the next note,
                       spelling (Fa♯ or Sol♭) and accidentals per bar, the staff for each hand
                       (staffPosition.ts), 8va for far runs, beams by the beat (beaming.ts);
                       pedals as bracket lines, tempo marks where the tempo holds for a bar.
                       engraving/ — engrave: how the notation is set on the staves, in staff
                       steps, by chapter: chords.ts (stems, seconds, voices, ledger lines),
                       marks.ts (articulations, fermatas, ornaments, tremolos, rolled chords),
                       slurs.ts (ties and slurs), rests.ts, graces.ts; index.ts puts chords,
                       beams and tuplets together. pedalEngraving.ts for pedal marks,
                       signatures.ts for key signatures and where the key and metre change.
                       No pixels: a thing's place is its bar and beat.
  application/
    ports/           AudioOutput, Instrument, Ticker, ScoreParser — interfaces the core needs.
    use-cases/       Playback (tempo, loop, hands, pedals, metronome, count-in), LoadScore,
                     PrepareInstrument (what the instrument must be ready to play).
                     Library (the shelf of pieces opened before, behind the PieceShelf port;
                     the same file is the same piece, told by its content).
  infrastructure/    Implementations of the ports:
    writers/           MidiFileWriter — the reader's other half: what is played in free play is
                       kept as a Standard MIDI File, a track for each hand.
    parsers/           MidiFileParser — Standard MIDI File reader written from scratch
                       (pedals from controllers 64, 66 and 67): notes, tempo and pedals as
                       played; what to print of them is the domain's (transcription.ts).
                       MusicXmlParser — MusicXML (.musicxml/.xml, and compressed .mxl through
                       a ZIP reader and Inflate written from scratch: zip.ts, inflate.ts) via DOMParser:
                       it only takes down what the file says is printed, as the domain's
                       Notation; the domain then plays it.
    audio/             SamplerPiano — a piano played from samples (public/piano): three
                       loudness layers, every third key recorded and the others shifted in
                       pitch, and the small sounds of keys, dampers and the pedal coming up.
                       The files (6 MB) are kept as fetched; decoded sound is large (the whole
                       set would take 400 MB), so only what the open piece needs is decoded,
                       and of each sample no more than its longest note sounds (pianoSamples:
                       samplesWanted). PrepareInstrument tells it the notes and the tempo.
                       WebAudioSynth — additive synth with a piano-like envelope: plays until
                       the samples are in, and the metronome.
    offline/           offlineCache — starts the service worker (public/sw.js) that keeps the
                       app and the samples on disk: a second visit works without the network.
    timing/            IntervalTicker.
    render/            CanvasPianoRoll — falling notes + keyboard on Canvas 2D, showing only
                       the octaves the piece uses (keyboardRange). When keys would get too
                       narrow, the keyboard scrolls and a lazy camera follows the music
                       (keyboardCamera); swipe or Shift+wheel to look around. Pedal moves
                       fall as plain labels ("Pedal ↓", "Left pedal ↑"…) beside three pedals.
                       SvgStaff — grand staff as a tape scrolling under a fixed cursor, with
                       the key and time signatures in force at the cursor (staffLayout) and
                       the notation as the domain engraves it; staffLayout says how wide bars
                       are on the tape, the staff/ folder turns bars and beats into pixels and
                       SVG, beams.ts and curves.ts into beam lines and slurs; sounding notes
                       light up.
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

## Plans and rules

- [docs/concept.md](docs/concept.md): what the app is for, its screens, where its tools go.
- [docs/roadmap.md](docs/roadmap.md): what is done, what is next and in what order, what was left out.
- [docs/rules.md](docs/rules.md): how the code and the interface are kept in order.
- [docs/design.md](docs/design.md): how the interface looks and why; what it is built of.
