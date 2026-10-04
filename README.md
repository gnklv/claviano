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
playback support (pickup, all note values, beams, accidentals, tuplets, voices, rests, ties, grace notes,
key/time/clef/tempo/dynamics changes, hairpins, a wide range, articulations, fermatas, slurs, the sustain
pedal and the soft and sostenuto pedals, repeats with voltas and D.S. al Coda). It is built by `scripts/showcase.ts`
(`npm run showcase` rewrites `public/demos/showcase.musicxml`) and checked end to end by
`tests/showcase.test.ts`. When you add a feature, add a bar to the showcase.

**Piano sound.** The samples in `public/piano` come from the
[Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) (a Yamaha C5)
by Alexander Holm, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
They were changed for the web: three of the sixteen loudness layers and the sounds of keys and the
pedal coming up, tails shortened to 12 seconds, converted to MP3. `scripts/samples.ts` (`npm run samples`) rebuilds them from the original.

## Controls

| | |
|---|---|
| Space | play / pause |
| ← → | previous / next bar |
| Tempo | 25–150%, pitch is unaffected; the tempo it makes is shown beside it (♩ = 45) |
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
  domain/            Note, Score, solfège pitch helpers. No dependencies. Notes carry two clocks:
                     seconds (playback) and beats in quarter notes (notation); scores carry
                     time and key signatures, and two timelines: bars as played (repeats
                     unrolled) and bars as printed, linked by barWritten. The three pedals
                     (pedal.ts) are kept beside the notes, which keep the length of the key.
                     A time map (beat → second, with tempo changes and fermatas) places the
                     metronome's clicks and the count-in (metronome.ts).
    notation/          Music theory for the staff: spelling (Fa♯ or Sol♭), accidentals per bar,
                       note values (quarter, dotted eighth…), quantization to a 1/32 grid,
                       and navigation: the performance order of repeats and jumps.
  application/
    ports/           AudioOutput, Ticker, ScoreParser — interfaces the core needs.
    use-cases/       Playback (tempo, loop, hands, pedals, metronome, count-in), LoadScore.
  infrastructure/    Implementations of the ports:
    parsers/           MidiFileParser — Standard MIDI File reader written from scratch
                       (pedals from controllers 64, 66 and 67).
                       MusicXmlParser — MusicXML (.musicxml/.xml, and compressed .mxl through
                       a ZIP reader and Inflate written from scratch: zip.ts, inflate.ts) via DOMParser:
                       sounding notes for playback (ties merged) and the notes as printed
                       (value, tuplet, accidental, stem, beams, clef, pedal) for the staff.
    audio/             SamplerPiano — a piano played from samples (public/piano): three
                       loudness layers, every third key recorded and the others shifted in
                       pitch; the open piece's notes are fetched first, and last the small
                       sounds of keys, dampers and the pedal coming up.
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
                       the notes laid out by notationLayout (as written for MusicXML,
                       inferred for MIDI) and beamed by beams.ts; sounding notes light up.
                       Pedal marks ("Ped." / "✱" or a bracket line, "Sost.", "una corda")
                       come from pedalLayout.
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

- [x] Sampled piano (Salamander Grand Piano) behind `AudioOutput`, kept on disk by a service worker
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
- [x] Soft (una corda) and sostenuto pedals (MIDI CC 67 / 66, MusicXML): quieter and duller notes,
      only the keys held at the press sustained; "una corda" / "tre corde" and "Sost." on the staff,
      the left and middle pedals light up in the corner
- [x] Metronome and count-in: clicks along the bars as played (tempo, loop, metre changes,
      pickup, fermatas), a count-in that leads into the beat where the music enters
- [x] Click to jump: on the staff or the falling notes, to the very place (snapping to a note next
      to it); drag to look around while the music plays on (the view returns after a while);
      Shift+drag / long press on the staff to loop bars; with repeats, the pass nearest to now
- [x] Key and time changes printed where they happen (double bar line, cancelling naturals, new
      signatures, with room before the bar's first note); metronome marks (♩ = 90, ♩. = 60) from
      MusicXML and MIDI, and the actual tempo next to the tempo slider
- [x] View modes: staff / falling notes / both
- [x] Light and dark themes, following the system by default
- [x] Notes on the staff, level 1: heads, stems, flags, dots, ledger lines, accidentals
- [x] Beams: grouped by beat (by three eighths in 3/8, 6/8…), with stubs and stacked levels
- [x] Seconds in chords: one head of each second on the other side of the stem, clusters
      alternating; ledger lines, accidentals and dots make room
- [x] 8va / 8vb: MusicXML octave shifts printed with their bracket (notes an octave nearer, sound
      unchanged); in MIDI, runs beyond three ledger lines go under 8va / 8vb (15ma when needed)
- [x] Dynamics (MusicXML): pp…ff, sf, fp and the like in the music font, hairpins, "cresc." / "dim.";
      between the staves, or under the lower one when notes fill the gap; hairpins and words play
      as a gradual change towards the next mark (or a step, when none follows)
- [x] Several voices on a staff: stems turned apart where the file crosses them, voices a second
      apart side by side, beams off another voice's notes; beams across both staves
- [x] Grace notes (MusicXML): small notes before their note, a lone one flagged (struck through for
      an acciaccatura), several under a beam; an acciaccatura and groups are crushed in before the
      beat, an appoggiatura takes half of its note (two thirds of a dotted one)
- [x] MIDI note values: up to the next note played (either hand), or the end of the beat, and a
      note held longer keeps its length; so a short-played quarter is still written as a quarter
