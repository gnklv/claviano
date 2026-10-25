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
  falls, which hand plays a line: a rule of music is written once, in `domain`, and tested there. A
  parser only reads what a file says (how it groups the notes, such as a MIDI file's tracks, is the
  file's; whose hand a group is, the domain's); a renderer only draws what it is given.
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

- **Two kinds of component, in two folders.** A building component (`ui/components`) does not
  reach the app: it asks for no `deps`, itself or through a composable or a component it uses. It
  is given what it shows through props (words, numbers, choices; a value of music where it draws
  music, as `TempoMark` does) and says what was done through emits; the browser's helpers and the
  kept choices (`preference`) it may use. A part of a screen (`ui/parts`) reaches the app: a use
  case, a view drawn through a port. A component goes where it belongs as it changes: one that comes
  to ask for the deps moves to the parts, in that commit, and back. Being used on two screens does
  not make a part a building component. (A test holds this: `tests/uiParts.test.ts`.)
- **A component's look is its own.** What holds it says where it stands (its place in a grid or a
  row, the room outside it, its width), and nothing else: not its padding, its colour, its type, its
  corners. What a place needs of it otherwise, it asks for by name, a prop or a slot (a button a
  pill, a sign of one's own in a chip). So a style does not reach into another component (no
  `:deep`), nor name its insides (`.button`, `.words`). (The piece's header had its padding set
  from outside, by the screen: the header could no longer say how it is spaced.) A test holds
  this: `tests/uiStyling.test.ts`.
- **A use case is mirrored into a component by one helper** (a snapshot, refreshed on its
  `onChange`), not by a composable written anew for each.
- **Behaviour that appears twice becomes a component or a composable** before the second copy is
  written: a pop-up that closes on Esc and on a press outside, a sheet, a choice kept between
  visits.
- **No state at the top of a module that a test cannot reset.** A listener or a ref made when a
  file is imported lives through every test after it. State is made where it is used, or the
  module gives a way to start it afresh.
- **The browser is touched in few places**, and they stand in `ui/browser`: the width of the screen
  is asked through `useMediaQuery`; a listener on the window is `useWindowListener`, an element's
  size `useResize`, and a view drawn into an element (a staff, a canvas) `useDrawnView`. A choice of
  the interface kept between visits is a `preference` (`ui/kept`). `localStorage`, `matchMedia`,
  `ResizeObserver` and listeners on `window` are not used straight from a component.
- **The rest of `ui` by what it is**: `app/` mirrors the use cases (`useMirror` and the snapshots made
  with it), `motion/` the glides and what goes away by itself, `navigation/` the screens' addresses
  and the keys of the computer, `theme/` the theme and the canvases' colours, `i18n/` and `icons/`.

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
  `AppSlider`, `TextField`, `PieceTile`, `ActionTile`, `ScreenHeader`, `SectionHeading`,
  `AppNotice`, `SettingRow`, `SheetDialog`, `PopOver`, `PanelControl`, `MenuList`, `AppIcon`): a
  screen does not write a button, a field or a slider of its own.
- **What moves takes its time from the tokens**: three durations and one curve, said in
  `ui/styles.css`. Less motion, where a person asks for it, is honoured there, once.
- **Every building component stands on the design page** (`#/design`), in each state its props
  switch (a variant, pressed, disabled), from the commit that adds it. The parts of screens do not:
  the screens' tests show them. (The same test holds this.)

## Code

- **What nothing uses is deleted in the commit that stops using it.** Not left "for later".
- **A feature of notation has its bars in the showcase** (`scripts/showcase.ts`) and its checks in
  the `tests/showcase*.test.ts` files (notes and rests; ways of playing and pedals; changes along
  the way).
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
