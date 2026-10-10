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
`tests/showcase.test.ts`. When you add a feature, add a bar to the showcase.

**Reference copies.** `tests/snapshots/` holds what the showcase comes out as: its score (notes as
played and as written) and its engraving, one line per note, chord or mark. `tests/snapshot.test.ts`
compares against them, so any change in reading, playing or engraving shows up line by line. A
change that is meant is accepted with `npm run test:accept`, and the commit shows what changed.

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
  infrastructure/    Implementations of the ports:
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

## Roadmap

- [x] Sampled piano (Salamander Grand Piano) behind `AudioOutput`, kept on disk by a service worker
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
- [x] Ornaments (MusicXML): trill (with its wavy line), mordents, turns (also delayed), with the
      small accidentals over and under them; tremolo on a stem and between two notes; rolled chords
      (through both hands as one wave). Each is drawn as printed and played as its notes
- [x] MIDI note values: up to the next note played (either hand), or the end of the beat, and a
      note held longer keeps its length; so a short-played quarter is still written as a quarter
- [x] A repeated note is seen to be repeated: its key goes out for a moment before each new
      strike, as a finger leaves it (the falling tiles keep their written length and touch)
- [x] Read as printed (MusicXML): notes and rests the engraver hid, notes without heads (a voice
      sharing a note with another), clefs with an 8, small (cue-size) notes, notes in brackets,
      fingering; the pedal as MuseScore 4 writes it; a title that is no editor's placeholder
- [x] Words in the music: the tempo in bold with its metronome mark, the character and ways of
      playing in italics; "rit.", "rall.", "riten.", "accel.", "a tempo" and "Tempo I" are played:
      a ritardando slows hardly at first and most at the end, further at the end of a piece than
      in the middle of one

Next, in this order (see [the concept](docs/concept.md): a library to start from, learning a
piece, free play). Each step stands on the one before, so nothing is laid out twice:

1. [ ] The frame of screens: the library (for now "Open file" and the demos, nothing remembered)
       and the learning screen with its new header; moving between them, an address for each
2. [ ] The new transport bar (always at hand / once a session / seldom) and the settings panel,
       with volume sliders for the piano and the metronome in it
3. [ ] Phones and tablets: the "⋯" sheet on a phone upright, strips that hide on a phone on its
       side; a pass on an iPhone and an iPad in the iOS Simulator (layout and touch), then on real
       devices (sound, memory, smoothness, the samples in iOS Safari)
4. [ ] The library remembers: opened pieces kept in the browser, each with its place, tempo, loop
       and hands; rename, remove, save out as a file
5. [ ] Install as an app on the phone (web app manifest, icons; the service worker is there):
       an installed app's library is not wiped by iOS Safari
6. [ ] Free play from the keys on the screen: what is played is written down as it is played,
       saved as a piece, saved out as MIDI
7. [ ] Fingering hints: where the notes give no fingering, a comfortable one worked out from the
       hand (how far each pair of fingers reaches, the thumb passing under, the thumb on black
       keys, the weak fingers), shown sparingly, as good editions do: where the hand moves or a
       finger crosses. First single lines, checked on scales and arpeggios, whose fingering is
       beyond dispute; then chords; held notes last, if at all. There is no one right fingering
       (two pianists agree on two notes in three): the aim is one that can be played, tried by
       hand at every stage. A hint, paler than printed fingering; the hand's size is a setting
8. [ ] Listening through the microphone (to research first): following a piece as it is played
       from the notes (a "wait mode" without a cable), then free play by ear
9. [ ] Sheet music from PDF (to research first): reading printed notes into the notation
10. [ ] Files with several instruments (low priority: the app is for one)
11. [ ] Web MIDI input (one more source of notes after step 6; waits for a keyboard and a cable)

At any time, between the steps: looking through real pieces for what is drawn or played wrong;
the research for steps 8 and 9; checks on real devices and on GitHub Pages.

Small things noticed, to fix between the steps:

- [ ] The top of the staff is cut off when the stage is low (a phone on its side, a wide and
      short window): an 8va bracket, words and tempo marks over high notes run past the edge.
      With step 3
