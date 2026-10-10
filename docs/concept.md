# Claviano: the concept

What the app is for, what screens it has and where its tools go. Agreed on 10 October 2026; the
redesign and the features after it follow this. The app as it stands is the player alone (see
"What is missing now").

## What it is

**A pianist's notebook: learn a piece someone wrote, and write down one's own.**

Two things to do, on one footing:

- **Learning a piece.** Open the notes, listen, slow down, loop the hard bars, play one hand at a
  time.
- **Free play.** Play something of one's own; the app listens and writes it down as notes.

What joins them: free play ends in a piece, the same kind of thing as an opened file. An idea
played, saved, and it can be learned with the same tools. (The code already works this way:
writing down what was played is how MIDI files are shown on the staff.)

## What is missing now

- **No home.** The app opens as an empty player, a file has to be chosen again every time, and
  free play has nowhere to live.
- **The header mixes unlike things:** opening a file, the demos, the piece's title, the view mode,
  the theme, the language, the practice settings.
- **The bottom bar is crowded on a phone:** everything is always in sight, though half of it is
  needed once a session.

## Three screens

Settings are not a screen: a panel that slides over any of the three.

### 1. Library: where the app starts

A shelf of one's pieces: a file opened once stays on it until it is taken off.

**What is on it.** Opened files (MIDI, MusicXML, .mxl); what was recorded in free play; the demos
(always there, not to be removed). A card shows the title, the bar it was left at and when it was
last opened; the latest come first. Beside the cards, two actions: "Open file" and "Free play".

**What is remembered of a piece.** The file itself, as it was given; the place one stopped at; and
the practice settings for this piece: tempo, loop, which hands are on. So coming back to a piece
is coming back to where it was left, at 70% on bars 25–28.

**The same file opened again is the same card,** told by its content, not its name. A file that
has changed (a corrected version under the same name) is a new card beside the old one: no
"replace?" question.

**What can be done with a piece.** Open it (into learning, at the same place); rename it; take it
off the shelf; save it out as a file: the original file for an opened one, MIDI for a recorded one
(MusicXML later: the app reads it, and does not write it yet).

**Where it is kept.** In the browser on this device (IndexedDB). So: no syncing (a phone and a
computer are two shelves; there is no server); the browser may wipe it (clearing site data,
private browsing; iOS Safari does so by itself after some weeks without a visit, unless the app is
installed); room is no concern (sheet music files are small). The library is a convenience, not a
safe: that is why recordings can be saved out as files.

**What it is not.** No folders, tags or search while there are a dozen pieces or two; no catalogue
of music from the internet (one brings one's own); no record of practice (minutes, progress).

States: a first visit (only "Open file", "Free play" and the demos) · pieces are there · a file is
being dragged in · a file is being read · a file did not open.

### 2. Learning: the stage, with what matters under it

A thin header (back to the library, the title, the view mode, settings), the stage (the staff, the
falling notes and keyboard, or both), and the transport bar.

States: standing · playing · counting in · a loop is on · the tape dragged away by hand · waiting
for a note (once there is a microphone or a MIDI keyboard) · the piano's sound still loading · no
network.

### 3. Free play: the keyboard leads, the staff writes after it

The keyboard is the main thing; the staff fills with notes as they are played. Record, stop, a
metronome, "Save as a piece". The header names where the notes come from.

States: ready · recording · recorded (listen, save or throw away) · no access to the microphone.

Where the notes come from is the screen's one dependency, and it does not care which: the keys on
the screen (mouse, touch, the computer's keyboard), the microphone, or a MIDI keyboard.

## The tools: by how often, not by kind

| How often | What | Where |
|---|---|---|
| Always at hand | play and pause, the place in the piece, tempo, loop | the bottom bar, always in sight |
| Once a session | hands, metronome, count-in, pedal, view mode | the bottom bar on a computer; behind "⋯" on a phone |
| Seldom | the sound (piano or synth), volume, theme, language, where the notes come from | the settings panel |

One rule: the first row never hides, the third never takes room on the stage.

## Computer, tablet, phone

- **A computer, a tablet on its side:** a thin header, the stage, a bar with the first two rows of
  tools in one line.
- **A phone upright:** the bar has play, tempo and loop; the rest is in a sheet that slides up from
  the bottom. "Both" does not fit this height: the staff or the keys.
- **A phone on its side:** the best way to see a keyboard. The header and the bar shrink to thin
  strips and hide while the music plays; a touch brings them back.
- **The computer's keyboard** stays (Space, the arrows by bars), with keys for tempo and the loop
  to add.

## What it takes in the code

Nearly all of the redesign is in `ui`: drawing, playback, the loop and opening pieces are behind
ports already. Two things are new in substance:

- **The library:** a port for keeping pieces and the place one stopped at, with IndexedDB behind it.
- **Free play:** the screen, and a port for where notes come from.

## The order

1. The three screens and the new bar, with what there is now.
2. Phones and tablets (straight after, so nothing is laid out twice).
3. The library.
4. Free play from the keys on the screen: not for playing in earnest, but a tune with one hand
   goes in, and the whole way works at once: played → notes → saved → learned.
5. The microphone (to research first): following a piece as it is played, and free play by ear.
