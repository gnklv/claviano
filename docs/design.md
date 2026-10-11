# Claviano: the design

How the interface looks and why. The rules of the code are in [rules.md](rules.md); this is the
look. What is said here can be seen: the design page (`#/design`, in development) shows every colour,
size and component, in both themes. A rule that the page contradicts is wrong in one of the two
places; mend it.

## The character

A pianist's notebook. Paper and ink by day; the lacquer of a piano by night. Titles are set in a
serif, as the words in sheet music are. One accent, the red of the felt inside a piano. The two hands
are two quiet inks. Nothing else has a colour.

The interface is quiet so that the music is what is looked at: the staff and the falling notes are
the brightest things on a screen, the controls the calmest.

## Colour

Every colour is a token in `ui/styles.css`, named for what it is for, in two sets (one a theme). A
component names the token; it never writes a colour.

| Token | For |
|---|---|
| `--bg` | the page |
| `--panel` | what lies on the page: a header, a tile, a sheet, a pop-up |
| `--control`, `--control-hover` | what is pressed |
| `--border` | edges |
| `--text` | ink |
| `--muted` | ink, said quietly: a note under a title, a label, what is off |
| `--accent` | the one main action of a screen |
| `--danger`, `--record` | what cannot be undone, and recording: both are the accent |
| `--right`, `--left` | the right hand (steel) and the left (sepia) |

- **The accent marks one thing on a screen**: the button that does what the screen is for (play;
  keep a take). A second red button means one of them is not the main action. It is also the colour
  of danger and of recording, which are rare and never beside the main action.
- **Steel and sepia are the hands, and nothing else.** Falling notes, lit keys, the hands' chips, a
  note under the cursor. A lit key must not pass for a white or a black one, which is why neither
  hand is ink or ivory.
- **No blue of a system.** A slider, a field's edge, a selection: each is drawn here, in the
  palette. What a browser would paint in its own colour is restyled.
- The music's own colours (the staff's ink, the cursor, the pedal, the keys) are tokens too, lower in
  the same file.

## Type

- **Titles in the serif** (`--font-title`, Playfair Display, its files kept in the app): the app's
  name, the name of a piece, the heading of a sheet, and the words on the staff. One weight
  (`--title-weight`).
- **Everything else in the system's own face** (`--font-text`): buttons, labels, numbers. A control
  is not a title, however large.
- **Five sizes**, `--text-xs` to `--text-xl`; `--text-m` is the size of the page. A field under a
  finger is never under 16px (`--text-field`): an iPhone zooms the page into a smaller one.
- Numbers that change in place (a bar, a tempo, a percentage) are tabular, so that nothing shifts.
- A note that stands for a tempo ("a quarter = 90") is of the music font, as on the staff
  (`TempoMark`).

## Space and shape

- **Spacing from a scale**, `--space-1` (4px) to `--space-6` (32px). Between the parts of one thing,
  1 or 2; between things, 3 or 4; between sections, 5 or 6.
- **Three radii**: `--radius-s` for what is small and inside something (a field, a row of a menu),
  `--radius-m` for what stands by itself (a button, a tile, a panel), `--radius-pill` for a chip and
  a slider's track.
- **Under a finger, everything pressable is 44px at the least** (`--touch`), on a touch screen and
  on a narrow window alike.
- What stands over the page (a pop-up) casts one shadow, `--shadow-raised`. Nothing else has one:
  depth is said by `--panel` on `--bg`, and by an edge.

## Icons

One set (`ui/icons/icons.ts`), drawn here, shown by `AppIcon`. Never a character of a font: those
are drawn by whichever font a system has, and an iPhone draws some as emoji. The linter holds this.

- A square of 24 units; a line 1.75 wide, its ends and corners round.
- What must read at a glance in a bar of controls is solid: play, pause, stop, record.
- An icon takes the colour of the words around it. Alone in a button it is 20px (`--icon`); beside
  words, 16px (`--icon-s`).
- A button that is an icon alone carries a name (`label`), read out and shown on hover.

## Motion

Three durations and one curve, and no others:

| Token | For |
|---|---|
| `--quick` (0.15s) | the answer to a touch, and what is small: a pop-up, a note fading in |
| `--medium` (0.3s) | what is large, going: a sheet sliding away, a strip folding, the theme changing |
| `--slow` (0.5s) | what is large, coming: a sheet sliding in |
| `--glide` | the curve of what moves across the screen: fast at first, settling slowly |

- A thing comes from where it was asked for and goes back there: a pop-up grows out of its button, a
  sheet slides from its edge. Nothing overshoots and comes back.
- What only fades or grows in place eases out plainly.
- **Less motion, where a person has asked their system for it, is none**: said once, at the end of
  `ui/styles.css`, for everything.

## The components

A screen is built of these, and does not write a button or a field of its own.

| Component | What it is | When |
|---|---|---|
| `AppButton` | an icon, words, or both | something is done. `primary`: the screen's one main action. `quiet`: it stands over something else |
| `ToggleChip` | on or off | what is switched while playing; one of a few values |
| `SegmentedControl` | one of a few, all in sight | a view, a theme, a time signature |
| slider (`input[type=range]`) | a level, or a place | volume, tempo, the place in the piece. Whoever sets its value sets `--fill` beside it |
| `TextField` | a name, a number | |
| `PieceTile` | a piece on a shelf | one's own pieces and the demos |
| `ActionTile` | something that can be begun: a sign, a name, a word about it | the few things a screen starts from; one of them is `main` |
| `ScreenHeader` | the strip on top of a screen | the way back, what the screen is, and what is set there |
| `SectionHeading` | the name of a section | over a group of tiles or rows |
| `AppNotice` | word of how things stand, or (`alert`) of something gone wrong | said in the page, where it concerns |
| `SettingRow` | what is set, and the control that sets it | the rows of a sheet |
| `SheetDialog` | a panel from the side (from below on a phone) | what is set once in a while, and what a phone's bar has no room for |
| `PopOver` | a small panel beside its button | what is set often, in a few touches; a menu |
| `MenuList` | the choices of a menu | inside a `PopOver` |
| `AppIcon` | an icon of the set | |
| `TempoMark` | a tempo as the page writes it | |

- **A pop-up or a sheet?** A pop-up where there is room and the thing is small; a sheet on a phone,
  and for what is long. The tempo is both: the same controls, in whichever fits.
- **A chip or segments?** Segments when the choices exclude one another and are few; chips when
  each is on or off by itself.
- A new component is added to the design page in the commit that adds it.

## Screens of different sizes

Three kinds of screen are told apart, by name (`ui/composables/useMediaQuery.ts`):

- **narrow** (under 600px wide): a phone held upright. One column; what is set once a session goes
  into a sheet.
- **short** (under 500px high): a phone on its side. Every pixel of height is the music's: the
  strips fold away while it plays.
- **under a finger** (`pointer: coarse`, or narrow): pressable things grow to 44px.

A layout that needs another width says why, beside the number.
