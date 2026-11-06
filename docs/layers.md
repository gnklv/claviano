# Learning a piece in layers

Enter Learn in the ordinary player to begin a short practice task. Where a useful reduced
selection exists, the first instruction is “Play the highlighted notes”, followed by “Add the
bass”, the rest of the leading hand where it adds a distinct step, the full fragment, tempo work
and joins. The intermediate instruction names the hand: “Add the rest of the right hand” or
“Add the rest of the left hand”. Three clean passes prepare the next task, paused
until the player is ready. In tempo work, Clean raises the next attempt by ten percentage points;
a slip lowers it by the same amount, down to the starting tempo (never raising a manually slower
tempo). Each assessment prepares the fragment paused at its start. Only three clean passes at
the target tempo complete the task. Playback alone does not raise the tempo; self-assessment at
a physical piano works the same way. The separate automatic trainer remains available outside
this task. Leaving or completing the plan pauses
playback and turns off automatic acceleration. Restarting the plan prepares its first task;
reselecting a task prepares it afresh. There is no separate page, voice picker or layer setup.

Decorated fragments start without ornaments or grace notes. Where useful, “Play without ornaments”
prepares the complete fragment before “Add the ornaments” restores the original slow performance.
Tempo work, joins and Listen use the original performance. Tremolos and rolled chords remain.

The selections are candidates, not recognised melodies. They belong
to the existing practice plan. Empty or identical preparation steps are omitted; fragments without
a useful reduction or complete event origins keep the existing hand-based preparation.

## The first selections

`layersOf(score, part, { lead? })` in `src/domain/practice/layers.ts` returns indices into
`score.notation.notes`. The original score and timing are kept. `Part` uses inclusive, zero-based
printed-bar indices, as the existing practice planner does.

1. **Lead:** the upper note at each attack of one chosen staff/voice pair. The voice is kept for
   the entire fragment, including its rests. Automatic selection prefers voices containing the
   right hand, then greater coverage in time, then a higher typical register. Coverage is the
   union of note durations, so a thick chord does not count several times. A caller can choose
   another available staff/voice explicitly; an invalid choice is rejected.
2. **Lead and bass:** add the lowest left-hand attack on each metrical pulse. Compound metres
   use their grouped beats, as the metronome does; a pickup is aligned with the end of a full bar.
   A syncopated attack is not moved to a beat, and a tied continuation is not a new bass attack.
   A higher attack is not added while a lower visible left-hand note is still held in written
   time, including across a fragment boundary. This keeps upper accompaniment out of the bass
   layer in Moonlight. Pedal resonance does not count as a held written note.
3. **Leading hand and bass:** retain the preceding selection and add every visible note assigned
   to the leading voice's hand, including its other voices. The selected voice must belong to
   exactly one hand. Ties are closed inside the fragment; if that would add notes of the other
   hand, this intermediate step is omitted. `addedHand` carries the instruction's hand to the UI.
4. **Full:** all ordinary written notes of the fragment. Empty and identical selections are
   omitted; a selection already containing everything is called `full`.

Hidden and headless notes remain in `full` but do not seed reduced selections. Selected ties
are completed inside the fragment. Ties crossing its boundary are reported, not silently used
to enlarge it. An entering leading tie is retained; its original attack can precede the fragment.

The result lists available voices and diagnostics with zero-based written-bar indices. Multiple
candidate voices, a left-hand fallback, absent bass pulses, boundary ties, grace notes,
ornaments, tremolos and rolled chords are reasons to inspect the result. They are not a calibrated
confidence score. A voice can contain arpeggiated accompaniment rather than a melody, and the
algorithm cannot establish that musical distinction. A fast single line stays fast.

Grace notes live in a separate collection and are not counted in these selections. Decorations
remain on the source notation. `full` in this API is a set of ordinary written notes; the practice
plan separately decides whether to demonstrate it with or without ornaments.

## Trying the local collection

```bash
npm run samples:layers
# Optional input and output folders:
npm run samples:layers -- /path/to/scores /path/to/report
```

The command discovers every supported MusicXML, MXL and MIDI file recursively under `samples/`
by default, keeping alternate formats as separate cases. It uses the application's actual parsers,
then `partsOf` and `layersOf`. It neither starts nor contacts the running player. A broken file
is reported and the remaining files are still inspected. Missing or empty collections, file
errors and structural violations produce a nonzero exit status.

The default outputs are `.layers/report.md` for a fragment-by-fragment overview and
`.layers/report.json` for the selections and indexed source-note table. Both `samples/` and
`.layers/` are ignored by Git: these local scores and derived note lists are not redistributed.
Headings use printed bar numbers; JSON `note.bar` and diagnostic bar lists use zero-based written
indices. MIDI is explicitly marked as having inferred hands/voices.

Structural checks ensure indices belong to the fragment, selections grow cumulatively without
duplicates, and the final selection contains every ordinary written note. Each selection is also
projected to the performed events: source objects, timeline, notation and pedals must be preserved.
The report counts those events across all repeated occurrences, separately from written notes.
It also projects the plain performance, validating provenance and preservation of the original
clock, bar order, pedals and notation. Changed previews report plain event and grace counts.
Passing these checks
does not establish musical quality. Diagnostic totals count fragments with each cue, not errors
or an accuracy percentage. The unit tests use small written examples and temporary files; they
do not require the private sample collection in CI.

## Playback and display

Run `npm run dev`, open a piece in the ordinary player and enter Learn. The first task is ready
without a separate start action. Its selected notes are heard through the existing scheduler and
instrument. The full fragment and subsequent tempo and joining tasks remain audible too. A
one-hand task demonstrates that hand; adding accompaniment demonstrates both. Muting a hand
remains an explicit choice. Inactive falling notes are hidden; inactive noteheads, accidentals, dots, fingerings
and grace notes are dimmed on the original staff. Stems, beams and the full notation remain
readable. Suppressed ornament signs and grace graphics are pale and do not light up. Switching
to Listen restores the original performance and clears the selection. The player retains the original Score and
library entry throughout; this is not a second generated piece.

`Note.sources` identifies the ordinary written notes or individual grace notes that produced an
event. Ornaments, tremolos and rolls retain their sources; tied events collect sources without
sharing mutable unions across repeat passes. MIDI transcription tracks original event indices
through written sorting, preserving the actual recorded times and velocities.

`scoreForLayer` filters the supplied event objects by those sources, keeping the original score's
timeline, bars, pedals and full notation. It does not regenerate a performance from filtered or
quantized notation. A tied event entering the fragment is resumed by the existing player. Grace
groups follow a selected target chord, even when only its upper note is selected; unattached
graces are included only in the full layer. Missing or invalid origins are rejected explicitly.
For preparation, `plainNotesOf(score)` reuses the notation performer to replace all seven supported
ornament kinds with their principal notes and remove grace groups. Removing appoggiaturas restores
the principal chord's onset and duration. Ties, repeated occurrences, articulation and dynamics
are retained; event times use the original occurrence order and time map, including fermatas.
Tremolos and rolled chords retain their execution. Scores without authored ornaments or graces,
including ordinary MIDI imports, keep their exact original event array. Incomplete provenance
falls back to ordinary practice rather than inventing a simplified performance.

`Playback.performanceScore` supplies the current event stream while `Playback.score` keeps the
canonical library identity. Stream and selection change atomically through the existing scheduler;
instrument preparation, falling notes, fingering and picking use the same effective stream.
`Playback.noteSelection` holds indices into that stream, independent of hand audibility.
Renderers receive the selection; they do not infer musical roles. Written source indices also
reach engraved noteheads, avoiding ambiguous pitch/time matching in chords and repeated notes.

Saved plans carry version 4. Version-two and version-three completion indices are interpreted
against their exact previous layer plans; unversioned indices use the original hand-based plan. They are migrated by a step's
meaning, never by its new position. Completing an old full-fragment or tempo task also credits
its new preparation tasks, including a complete one-hand fragment and plain preparation.
Plain completion never credits the original decorated task. Unknown versions do not grant completion.
Returning to Learn preserves the user's tempo and hand settings; a fresh task starts with its
suggested settings. A saved manual range that does not match an unfinished task stays free
practice, so it is not silently replaced or credited as a different fragment.

## First fragment review

These observations concern the local arrangements in `samples/`. Counts are ordinary written
notes; ties and repeats make performed-event counts different. They are inspection results, not
an automatic judgement of musical quality or a claim of practice at an instrument.

| Local piece and printed bars | Lead / with bass / leading hand / full | Observation |
| --- | --- | --- |
| Czardas, 22–25 | 10 / 18 / — / 42 | The added bass alternates D3 and A2 on the quarter-note pulses. The right hand is already complete, so no intermediate task is added. The intervening chords enter only in full; the original melody rests remain. |
| Czardas, 54–57 | 14 / 19 / 29 / 46 | The new task adds the right hand's chord filling and second voice before the full accompaniment. Held low basses keep higher chord attacks out of the bass anchors. Graces return with the original full performance; rolled timing remains throughout. |
| Czardas, 70–73 | 12 / 20 / 31 / 50 | The right hand grows separately from the remaining accompaniment. Bass candidates can be in the middle register; there is no fixed pitch split in the layer rule. |
| Moonlight, 5–8 | 10 / 16 / 42 / 72 | Six low bass anchors support the leading line, then the right hand's figuration enters before the full fragment. The lead begins after a real rest, so the start of its audition is silent. |
| Prelude BWV 846, 1–4 | 48 / 56 / — / 72 | The chosen upper voice remains an arpeggiated pattern, not a separately recognised melody. The right hand adds nothing to the preceding selection, so the intermediate task is omitted. |

The complete local collection gains a distinct intermediate selection in 324 of 581 fragments
(31 files, including alternate formats). This is coverage of the rule, not a musical quality score.
Plain execution changes 23 fragments in that collection. For example, Czardas 54–57 has 48 full
events with ornaments and 46 without; Married Life 33–36 goes from 64 events to 28 sustained ones.

## Next stages

- Review candidate lines in contrasting fragments from the whole collection, including the
  changes of texture in Czardas. Record explicit expected selections in small, self-contained
  tests when correcting a rule; do not special-case a file name.
- Extend listening checks in Learn to further contrasting fragments and compare the candidates
  by ear and at the instrument; the browser checks establish audio scheduling, not musical taste.
- Simpler written arrangements remain separate. Collapsing an arpeggio into a chord changes
  attacks and needs musical rules beyond ornament removal.
