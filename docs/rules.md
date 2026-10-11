# Claviano: the rules

How the code and the interface are kept in order. Each rule is here because breaking it has already
cost a refactoring; the cause is said beside it. Where a rule can be checked by the linter or by a
test, it is, and says so: a rule a machine holds is not forgotten.

Before writing anything new, look for what is already there. Most of what was tidied was a second
copy of something written a month before.

## The layers

- **`domain` knows music and nothing else**: no browser, no file formats, no pixels. `application`
  uses the domain through use cases and owns the ports. `infrastructure` implements the ports. `ui`
  shows, and calls use cases. Imports go one way: `domain` ← `application` ← `infrastructure`, `ui`;
  `ui` never imports `infrastructure` (the linter holds this).
- **Theory lives in the domain.** How long a note sounds, which finger takes it, where a bar line
  falls: a rule of music is written once, in `domain`, and tested there. A parser only reads what a
  file says; a renderer only draws what it is given.
- **A renderer never decides what is shown.** It is handed the thing to draw, whole. (The staff once
  worked out fingering hints itself, behind a switch on its port: a decision of the interface had
  moved into a drawing class.) If a port grows a method like `setShowX(on)`, the choice belongs a
  layer up: give the renderer different data instead.
- **Drawing is infrastructure.** Canvas and SVG are drawn in `infrastructure/render`, behind a port
  in `application/ports`; a component owns the element and the frame, not the pixels. (The tiles of
  free play were drawn inside a component while the falling notes had a port: two ways to do one
  thing.) The linter holds this: no `getContext` in `ui`.

## Use cases

- **One job each.** A use case that starts to answer questions of another kind is two use cases.
  (`Library` came to hold the shelf, the opening of pieces, their memory, their renaming and the
  state of the storage.) Glue between use cases is a small function of its own, named for what it
  keeps (`rememberPieces`, `keepTake`), not a method on one of them.
- **A use case does not do another's work.** If it needs something done that another already does,
  it asks that one, or the thing that wires them does. (Free play readied the instrument for the
  open piece on leaving, which is `PrepareInstrument`'s.)
- **One mechanism for one need.** One scheduler hands sound to the output ahead of time; one way
  keeps a choice between visits. A second one is a bug waiting for the day the first is fixed.
- **Wiring is in `main.ts`**, and only there. The interface gets what it needs through `deps`.

## The interface

- **A use case is mirrored into a component by one helper** (a snapshot, refreshed on its
  `onChange`), not by a composable written anew for each.
- **Behaviour that appears twice becomes a component or a composable** before the second copy is
  written: a pop-up that closes on Esc and on a press outside, a sheet, a choice kept between
  visits.
- **No state at the top of a module that a test cannot reset.** A listener or a ref made when a
  file is imported lives through every test after it. State is made where it is used, or the
  module gives a way to start it afresh.
- **The browser is touched in few places.** A choice of the interface kept between visits is a
  `preference` (`ui/preferences.ts`); the width of the screen is asked through `useMediaQuery`.
  `localStorage`, `matchMedia` and listeners on `window` are not used straight from a component.

## The look

The character is a pianist's notebook: paper and ink, titles in a serif, one accent. The full rules
are in [design.md](design.md); these are the ones most easily broken:

- **Tokens, not values.** A component has no colour, radius, size of type, spacing or width of
  screen written by hand: each comes from a token. A new value means a new token, with a reason.
- **Colour means something.** The accent marks the one main action of a screen. Steel and sepia are
  the right hand and the left, and are used for nothing else.
- **Icons come from the set** (`ui/icons`, drawn by `AppIcon`), never from the characters of a font
  (they differ between systems, and an iPhone draws some as emoji). The linter holds this. A new
  icon is drawn in the manner of the others and shows itself on the design page.
- **Under a finger, everything pressable is 44 px at the least.**
- **The interface is built of the components** (`AppButton`, `ToggleChip`, `SegmentedControl`,
  `TextField`, `PieceTile`, `ActionTile`, `ScreenHeader`, `SectionHeading`, `AppNotice`,
  `SheetDialog`, `PopOver`, `MenuList`, `AppIcon`): a screen does not write a button or a field of
  its own.
- **What moves takes its time from the tokens**: three durations and one curve, said in
  `ui/styles.css`. Less motion, where a person asks for it, is honoured there, once.
- **A new component is added to the design page** (`#/design`) in the commit that adds it.

## Code

- **What nothing uses is deleted in the commit that stops using it.** Not left "for later".
- **A feature of notation has its bars in the showcase** (`scripts/showcase.ts`) and its checks in
  `tests/showcase.test.ts`.
- **Comments say why**, in the words of the subject (music, the hand, the page), not what the next
  line does.
- **A constant has a name and a reason.** A number tuned by ear or by hand says so, and against
  what it was tuned.
- **No new dependency for what a page of code does.** The parsers, the ZIP reader, the PNG and MIDI
  writers are written here; that is a choice, kept.

## Tests

- **By behaviour, in the words of the user**: what the thing does, not how it is built.
- **One file a screen** for the app's tests (`tests/app`), on a shared harness
  (`tests/app/harness.ts`); a test file past a few hundred lines is split.
- **Stand-ins for the ports live in `tests/fakes.ts`**, one of each.
- **Nothing is left over from one test to the next**: storage, the address, module state.
- A test that waits on time uses a clock set by hand, not a real delay.

## Work

- **A plan first, agreed; then the work.** One feature at a time; the working tree holds one commit
  in the making.
- **Looked at, not assumed.** What can be seen is checked in the browser or the simulator; sound
  and fingering are checked by the person at the instrument, stage by stage. What was not seen is
  said to be not seen.
- **Nothing that throws away uncommitted work**: no `git checkout` of a file, `git restore`,
  `git reset --hard`, `git stash drop` or `git clean`. The working tree is someone's commit in
  progress. To undo a trial, edit it back.
- **The documents follow the code** in the same commit: the roadmap, these rules, the README.
