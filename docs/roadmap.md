# Claviano: the roadmap

What is done, what is next and in what order. (What the app is for: [concept.md](concept.md). How it is kept in order: [rules.md](rules.md).)

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
- [x] Volume for the notes and for the metronome, each on its own; the metronome clicks from a
      recording of one
- [x] A repeated note is seen to be repeated: its key goes out for a moment before each new
      strike, as a finger leaves it (the falling tiles keep their written length and touch)
- [x] Read as printed (MusicXML): notes and rests the engraver hid, notes without heads (a voice
      sharing a note with another), clefs with an 8, small (cue-size) notes, notes in brackets,
      fingering; the pedal as MuseScore 4 writes it; a title that is no editor's placeholder
- [x] Words in the music: the tempo in bold with its metronome mark, the character and ways of
      playing in italics; "rit.", "rall.", "riten.", "accel.", "a tempo" and "Tempo I" are played:
      a ritardando slows hardly at first and most at the end, further at the end of a piece than
      in the middle of one

Next, in this order (see [the concept](concept.md): a library to start from, learning a
piece, free play). Each step stands on the one before, so nothing is laid out twice:

1. [x] The frame of screens: the library (for now "Open file" and the demos, nothing remembered)
       and the learning screen with its new header; moving between them, an address for each
2. [x] The new transport bar (always at hand / once a session / seldom; on a phone the middle
       ones are in a sheet behind "⋯") and the settings panel, with volume sliders for the piano
       and the metronome in it
3. [x] Phones and tablets: a phone upright (practice behind "⋯", the staff or the keys) and on its
       side (the header and the transport leave the screen to the music); a tablet; finger-sized
       controls; a pass on an iPhone and an iPad in the iOS Simulator and on a real iPhone
4. [x] The library remembers: opened pieces are kept in the browser (IndexedDB) and stand in the
       library, apart from the demos, each under an address of its own; each (a demo too) comes
       back with its place, tempo, loop and hands; a piece can be renamed, saved out as its
       file, taken off the shelf. The browser is asked to keep the storage; where it gives
       none, the library says so
5. [x] Install as an app: the web app manifest, the icons (`npm run icons` draws them), an
       iPhone's tags, the system bar in the header's colour; in the settings, a button to install
       where the browser lets the page ask, and a word on how on an iPhone. An installed app's
       library is not wiped by iOS Safari
6. [x] Free play from the keys on the screen: a keyboard that sounds under fingers, the mouse
       and the computer's keys; recording to a metronome, from the first note; the take written
       down as notes while it is played; listened to, mended at its end, and kept as a piece on
       the shelf (a MIDI file, written by a writer of our own), to be learned as any other
7. [x] Fingering hints: where the notes give no fingering, a comfortable one worked out from the
       hand (`domain/fingering`), by the rules of Parncutt and others (1997): what each pair of
       fingers reaches, the weak fingers, the thumb on black keys, the thumb passing under.
       Scales are fingered as every school teaches them (a table, all 24 keys); a chord by its
       shape; a bass note and the chord over it as one position of the hand. Fingers the notes
       give stand, and the rest is fitted to them. Shown on the staff, paler than the notes' own
       and sparingly, as an edition does: where the hand begins, moves, or takes a chord, and
       each thing once. Off unless asked for (the settings). A recommendation: tried by hand on
       two pieces, and no two pianists finger alike
Before the next steps, in this order (agreed after a review of the code and of the look):

- [x] Tidying, each a small commit:
  - [x] what nothing uses goes (`domain/fingering/score.ts`: the hints are worked out from the
    written notes now);
  - [x] one helper for mirroring a use case into the interface (`useMirror`), in place of nine
    copies;
  - [x] the staff is given the piece with its fingering hints written in; it does not decide
    whether to show them;
  - [x] the tiles of free play are drawn in `infrastructure/render`, behind a port, as the
    falling notes are (and the linter holds it: no canvas is drawn in `ui`);
  - [x] the app's tests by screen (`tests/app`), on one harness, with nothing left over from one
    test to the next; and with it one way of keeping the interface's choices (`ui/preferences.ts`:
    the view, the theme, the language, the hints), read afresh for each test.
- [ ] A design system, each step looked at before the next:
  - the character: a pianist's notebook. Paper and ink; titles in a serif, as words in sheet music
    are; one accent, the red of a piano's felt, for the one main action of a screen. Steel and
    sepia, two quiet inks, are the hands', and nothing else's;
  - [x] tokens (`ui/styles.css`): colours by role in two themes (paper and ink; a piano's
    lacquer), five sizes of type, a scale of spacing, three radii, three durations and one
    curve. (The widths of screen wait for the screens: a media query cannot read a variable.)
  - [x] the serif (Playfair Display, its files kept here): the titles, and the words in the music,
    which were in whatever serif a system had. The hands, the sliders and the pedal in the
    palette's own quiet colours, no blue of a system's left;
  - [x] icons of our own (`ui/icons`), one set drawn in one manner, in place of characters of a
    font; the note of a tempo ("a quarter = 90") in the music font, as on the staff. A page of the
    design system (`#/design`, in development only) shows the set, and will show the components;
  - [x] the components: a button, a chip, segments, a slider, a field, a tile for a piece, a
    screen's header, a sheet, one pop-up (the tempo's panel and a piece's menu were two) and a menu
    in it; three durations and one curve for all that moves. The design page shows them all, to be
    looked at in both themes, as the showcase does for notation;
  - the rules written down (`docs/design.md`);
  - the screens repainted, one at a time.
  With it: one pop-up in place of two, no colour written by hand in a component.

Then, when the places are next touched: free play does not ready the instrument for the piece
(that is PrepareInstrument's), one scheduler of metronome clicks for playback and recording, what
is remembered of pieces out of `Library` into a class of its own.

8. [ ] A tempo trainer: a loop that quickens by itself, a little each time round, from the tempo it
       is begun at to the piece's own
9. [ ] One's own fingering over the hints: a finger set by hand at a note stands as the notes'
       own do, is kept with the piece, and the hints are fitted round it
10. [ ] Bookmarks in a piece: named places ("the reprise", "the hard bars") to go to at a press,
        kept with the piece
11. [ ] The library saved out as one file and read back in: the pieces and what is remembered of
        each. A copy against the browser clearing its storage, and the way from a phone to a
        computer (there is no server)
12. [ ] Listening through the microphone. What can be heard: one note at a time, reliably (a
        pitch detector written here); whether the notes that are expected sound, chords too
        (energy at their pitches and overtones); any chord by ear, not without a trained
        network, and not planned. In this order, each tried on a real instrument before the
        next: access and a "tuner" on the free play screen (what note is heard); the pitch of
        one note, its beginning and end; free play by ear, one voice (one more source of notes
        for the screen that is there); following a piece, a "wait mode" without a cable (first
        one hand's line, then chords by checking for what is expected); real devices (an
        iPhone changes its sound when the microphone is on; the microphone needs HTTPS).
        To be heard: a digital piano through its speakers, by a phone and by a laptop
13. [ ] How it was played, once the microphone hears a piece through: how many of the notes
        were there, and how even the time
14. [ ] Sheet music from PDF (to research first): reading printed notes into the notation
15. [ ] Files with several instruments (low priority: the app is for one)
16. [ ] Web MIDI input (one more source of notes after step 6; waits for a keyboard and a cable)

Looked at in other players (Synthesia, flowkey, Simply Piano, Piano Marvel, Soundslice) and left
out: note names on the tiles and keys, showing only the bars being practised, transposing (no
need seen for them); printing a piece or a take (no case for it yet); courses and catalogues of
songs, streaks and points, lists of what was practised (not what a pianist's notebook is for).

At any time, between the steps: looking through real pieces for what is drawn or played wrong;
the research for steps 12 and 14; checks on real devices and on GitHub Pages.

Small things noticed, to fix between the steps:

- [ ] The metronome's click is not there yet: better than the synth's blip and than a mechanical
      metronome recorded in a room (rattling, blurred next to the piano), but a little synthetic.
      To come back to: a studio recording of a woodblock or of a mechanical metronome, cut to
      the sample (scripts/metronome.ts)
- [ ] Fingering hints are on the staff only: the falling notes do not show them
- [ ] A fingering over a bar's first note can run into the bar's number
- [ ] Words over the staff run into each other where two stand at one place ("Values" over the
      tempo mark at the start of the showcase)
- [x] The top of the staff was cut off when the stage is low: a phone on its side shows the
      staff or the keys, not both, and gives them the whole screen while the music plays
