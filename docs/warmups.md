# Warm-ups and exercises

## Agreed scope

One catalogue, with three levels. Fine technique, chords, large movements and speed work belong
to the exercises themselves; they are not separate sections or switches. The level and the time
available are independent choices. These are Claviano's levels, not examination grades.

| Level | Exercises |
|---|---|
| Beginner | Five notes up and down, legato and staccato, broken and blocked root-position triads; each hand separately |
| Intermediate | One- and two-octave scales, broken triad inversions, chord changes, arpeggios, changes of position, rhythmic variants; separate hands or both |
| Advanced | Short scale groups with pauses, repeated notes with changing fingers, written-out trills, bass-to-chord patterns, leaps and octaves |

The first catalogue is in C major. Both hands play at distinct registers. Leaps and octaves are
available on their own, but are not put into a suggested warm-up: a level alone does not say what
the player can comfortably reach or how confidently they can land a large move. More keys and more patterns can follow without adding
another level selector. A longer session never silently selects a harder exercise.

Every exercise has a concrete task, notes, an explicit fingering for each hand, a suggested tempo
and a stable identity. Rhythmic variants and short fast groups are named exercises in the same
list. Suggested tempos are starting points for trying the patterns, not speed targets or grades.
The player chooses a warm-up containing movements they already know; learning a new movement
belongs in a single exercise first.

## Flow

1. A secondary **Warm-ups and exercises** entry below the library's existing main actions.
   Continue still names the last library piece.
2. One preparation screen with **Warm-up / One exercise**, the level, and the relevant choices.
   Warm-ups offer **About 5 / 10 / 15 minutes**; single exercises offer the actual available
   patterns and hands. The complete proposed sequence is visible before opening it.
3. **Open warm-up** opens the first exercise in the existing player, paused. Notes, fingering,
   tempo and metronome use the existing machinery. There is no extra Learn step.
4. A compact, always-visible line names the current task and its place in the sequence. Its
   title opens the full sequence. Play remains the primary action; Next is secondary.
5. Next stops playback and opens the next exercise paused. Pausing keeps the place and settings.
   Leaving keeps the sequence, task and settings in memory until the page is reloaded. The
   library offers a separate way back to it, without replacing Continue for a piece.
6. The final task offers **Finish warm-up**. A completion view offers **Back to library** and
   **Repeat warm-up**, without claiming that the notes were played correctly.

Time is an estimate of playing the suggested repetitions at the initial tempos. It excludes
preparation, pauses between attempts and manual transitions. Changing tempo changes the actual
time. Repetitions are recommendations, not an automatic assessment or a gate on Next. The player
can stop early. The score contains one pass; a session must not turn fifteen minutes into one
large score or a long automatic PracticePlan.

## Implementation order

Each stage is one reviewable commit, committed by the user. The complete feature includes all
three levels; beginning with the musical core does not reduce its scope to beginner exercises.

### 1. Musical core and session selection

Implemented.

- `src/domain/exercises/catalog.ts`: the three levels, exercise identities, tasks, allowed hands,
  suggested tempos and suitability for a suggested warm-up.
- `src/domain/exercises/patterns.ts`: the small, explicitly fingered musical patterns.
- `src/domain/exercises/score.ts`: written notes, bars, rests, beams, articulation and tempo;
  `performNotation` produces the ordinary Score. Reuse scale fingering and notation rules.
- `src/domain/exercises/warmup.ts`: a deterministic sequence for a level and 5, 10 or 15 minutes.
  Separate hands receive equal repetitions. Allocation changes the repetitions, not the level;
  estimates are calculated from the generated scores, with no invented transition allowance.
- `tests/exercises.test.ts` and `tests/warmup.test.ts`: musical examples and all level/time pairs.
  Check fingers, hand separation, sounding and written time, rests and durations, plus invalid
  choices. Write and observe the failing tests before implementing each behaviour.

### 2. Session and player

Implemented. `WarmupSession` owns the queue; `followWarmup` opens its current task and keeps the
position, learning settings, bookmarks and fingering while away. Returning opens it paused, even
after another piece or free play. Browser Back/Forward also leaves and resumes the session.
`Playback.onBeforeLoad` lets outgoing state be captured before score-bound controls reset.
Generated scores bypass PracticePlan and the shelf; cancellation covers pending browser file
reads as well as demo and shelf openings. The library's Continue and piece memories stay separate.

The development console can also exercise the session:

```js
window.claviano.warmup.start('intermediate', 10);
window.claviano.warmup.next();
window.claviano.warmup.leave();
window.claviano.warmup.resume();
window.claviano.warmup.finish();
window.claviano.warmup.restart();
```

The implementation covers:

- `src/application/use-cases/WarmupSession.ts` and `tests/WarmupSession.test.ts`: start,
  current task, recommended passes, next, finish, leave and resume. Keep state per instance.
- Ready-made scores integrated with `OpenScore`, `Library` and `Playback` through explicit
  opening/cancellation contracts. Cancel pending file/demo openings. Generated scores are not
  demos and are not written to the shelf.
- Wiring in `src/main.ts`. Reuse Playback, BarLoop and PrepareInstrument. Explicitly initialize
  tempo and hands: Playback.load alone does not reset them. Keep library piece memory separate.
- Tests for late openings, next during playback, return after opening a piece, and independent
  library Continue. No second audio scheduler and no automatic assessment of playing.

### 3. Screens and design review

Implemented. The library has a secondary entry and a separate return to the unfinished session.
`#/warmup` prepares either a warm-up or one exercise. All three levels, allowed hands, the C-major
key and suggested repetitions are shown before opening. Time changes the repetitions only.
The mode and hand choices fill their rows in equal segments, without an empty tail inside the frame.
Both modes keep the same layout: settings on the left, the sequence or exercise details on the
right. On a phone these stack; one exercise's details precede its opening button, while a warm-up
can open without scrolling past the whole queue. Changing mode leaves the shared heading, mode
and level in place.
`WarmupTaskBar` stays visible above the stage, including while the other strips fold away on a
phone on its side. Its title opens the queue, or the task's details for a single exercise.
The current row is marked as current, never as successfully played. Next and Finish are manual;
early finishing is in the sequence sheet. Completion offers the library, a repeat or a new choice.
Preparation, playing and completion replace one another in the same history entry, so Back leads
to the library. A fresh library entry opens preparation rather than the previous completion.

English and Russian copy, the 17 exercise-to-score choices, valid hands, independent library
Continue, cancellation of a slow file read, returning, repeating and completion are covered by
screen tests. The preparation, player, sequence and completion were viewed in headless Chrome
at phone, landscape phone, tablet and desktop sizes in both themes, and reviewed with the design
chat. This does not replace an iOS device check or listening and fingering checks at the piano.

- The library entry, preparation screen, task line, sequence sheet and completion state
  use the existing UI components, navigation and useMirror, with English and Russian copy.
- Screen tests under `tests/app/`: both modes, all three levels, duration changes, an actual
  type-to-exercise match, paused opening, manual transitions, leaving/resuming and completion.
- Phone portrait/landscape, tablet and desktop, both themes, keyboard access and touch targets
  checked in Chrome. The task row stays visible during landscape playback. At 320 px the existing
  transport gives the loop its own row so the bar range stays together and practice stays reachable.
- The design chat reviewed the screens; architecture and code review used Astra. No broad
  redesign of Learn or transport is part of this feature.

For every stage: `npm run lint`, `npm run typecheck`, `CI=true npx vitest run`, `npm run build`.
Update the roadmap and README with what is actually implemented. Browser viewing, listening and
trying the fingers at the instrument are separate checks; report any that were not performed.

## Musical references and validation

- [RCM Piano Syllabus 2022, pp. 9 and 14](https://teacherportal.rcmusic.com/getattachment/57f3734d-97e5-4777-b67e-4b1111ee31a3/piano-syllabus-2022-edition.pdf): preparatory five-note patterns, articulation, triads and one-octave scales.
- [ABRSM Piano 2025–2026, p. 20](https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20%26%202026%20Prac%20syllabus%2020240524_access.pdf): initial separate-hand scales and short arpeggios.
- [Practising the Piano: rhythm practice](https://practisingthepiano.com/rhythm-practice-done-right/): purposeful rhythmic variants and expanding groups with stopping points.
- [Graham Fitch: dotted rhythms](https://practisingthepiano.com/on-dotted-rhythms/): keeping control and releasing effort between short groups.
- [Melanie Spanswick: octaves](https://www.pianistmagazine.com/blogs/9-professional-tips-for-practising-octaves/): short practice periods and gradual speed work.

These inform the kinds of task, not a claim of equivalence to a curriculum or a proven universal
routine. Claviano generates its own simple patterns. Automated tests verify musical data and
behaviour; they do not verify posture, suitability for an individual, or comfort at the piano.
The patterns and starting tempos need an instrument check before the feature is offered as a
finished practice routine, especially two-hand, repeated-note, leap and octave exercises.
