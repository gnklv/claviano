import { barAtBeat, type Score } from '../../score';
import { groupBy, type NonEmpty } from '../../group';
import { staffStep } from '../staffPosition';
import type { Clef, WrittenNote, WrittenRest } from '../written';
import { ledgerSteps, markHandCrossings, shiftVoicesApart, stemUpFor, stepSpan, untangleVoices, voiceKeys, withSeconds } from './chords';
import { layoutGraces } from './graces';
import { layoutArpeggios, layoutMarks, layoutOrnaments, layoutTremolos } from './marks';
import { layoutRests } from './rests';
import { layoutSlurs, layoutTies } from './slurs';
import type { Beam, NotationLayout, StaffChord, StaffNote, StaffOctaveShift, Tuplet } from './types';

/*
 * Engraving: how notation is set on the staves. From the notes as written to what stands where:
 * chords on their stems (which way the stem goes, which head moves aside for a second), beams and
 * tuplets, ledger lines, ties and slurs (over or under), articulations, fermatas and ornaments
 * (on which side, how far out), rests, grace notes. Vertical places are in staff steps (see
 * staffPosition.ts).
 *
 * By chapter: chords.ts (stems, seconds, voices), marks.ts (articulations, fermatas, ornaments,
 * tremolos, rolled chords), slurs.ts (ties and slurs), rests.ts, graces.ts; here, the chords
 * themselves with their beams and tuplets, and the whole put together.
 *
 * Nothing here is in pixels or knows how the page is drawn. Horizontally the engraving only
 * says where in the music a thing stands (its bar and beat); how wide that is drawn is the
 * renderer's business.
 */

export type * from './types';
export { ledgerSteps, shiftVoicesApart, stepSpan, untangleVoices, withSeconds } from './chords';

/** Engraves a score: its notation, set on the staves. */
export function engrave(score: Score): NotationLayout {
  const layout = layoutWritten(score, printedNotes(score.notation.notes), score.notation.rests);
  // Stem directions are final only now (beams may have changed them): place the heads of seconds.
  return { ...layout, chords: shiftVoicesApart(layout.chords.map(withSeconds)) };
}

/** The notes that are printed. Where the first note of a chord is hidden, the next one leads the chord. */
function printedNotes(notes: readonly WrittenNote[]): readonly WrittenNote[] {
  if (!notes.some((note) => note.hidden)) return notes;
  const printed: WrittenNote[] = [];
  let leaderless = false; // the chord being read has lost its first note
  for (const note of notes) {
    if (!note.chord) leaderless = false;
    if (note.hidden) {
      leaderless ||= !note.chord;
    } else if (note.chord && leaderless) {
      printed.push({ ...note, chord: false });
      leaderless = false;
    } else {
      printed.push(note);
    }
  }
  return printed;
}

/**
 * Lays out printed notes exactly as written: values, accidentals, stems, beams and
 * tuplets come from the file, and pitches sit where the clef in force puts them.
 */
function layoutWritten(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[]): NotationLayout {
  // A note marked as a chord shares the stem of the note before it.
  const groups: NonEmpty<WrittenNote>[] = [];
  for (const note of written) {
    const open = groups.at(-1);
    if (note.chord && open) open.push(note);
    else groups.push([note]);
  }

  const voiceOf = voiceKeys(written);
  const entries = groups.map((group) => {
    const first = group[0];
    const staff: Clef = first.staff >= 2 ? 'bass' : 'treble';
    const bar = barAtBeat(score, first.beat);
    const notes = group
      // The clef in force (not the staff) decides where a pitch sits.
      .map((note): StaffNote => ({ step: staffStep(note.pitch, note.clef), accidental: note.accidental, ...(note.headless ? { headless: true } : {}) }))
      .sort((a, b) => a.step - b.step);
    const { top, bottom } = stepSpan(notes);
    const chord: StaffChord = {
      staff,
      hand: first.hand,
      beat: first.beat,
      beats: Math.max(...group.map((n) => n.beats)),
      bar,
      beam: null,
      handMark: false,
      notes,
      duration: first.duration,
      stemUp: first.stem ? first.stem === 'up' : stemUpFor(top, bottom),
      ledgerSteps: ledgerSteps(top, bottom),
    };
    return { chord, group, voice: voiceOf(first) };
  });
  // By place along the page; chords at one place keep the order they are written in.
  entries.sort((a, b) => a.chord.beat - b.chord.beat);
  const chords = entries.map((entry) => entry.chord);
  markHandCrossings(chords);

  // Walk each voice in order, following the file's beam and tuplet marks.
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  const byVoice = groupBy(
    entries.map((entry, index) => ({ ...entry, index })),
    (entry) => entry.voice,
  );
  for (const voice of byVoice.values()) {
    let beam: number[] = [];
    let tuplet: { chords: number[]; number: number; showNumber: boolean; bracket: boolean | null } | null = null;
    const closeBeam = () => {
      if (beam.length >= 2) {
        const index = beams.length;
        // On one staff, a beamed group points all its stems one way: as the file says for its first
        // note, or by where the group sits on the staff. A group across both staves keeps each stem.
        const first = beam[0]!;
        const members = beam.map((i) => chords[i]!);
        const oneStaff = members.every((chord) => chord.staff === members[0]!.staff);
        const written = entries[first]!.group[0].stem;
        const steps = members.flatMap((chord) => chord.notes.map((n) => n.step));
        const stemUp = written ? written === 'up' : oneStaff ? stemUpFor(Math.min(...steps), Math.max(...steps)) : members[0]!.stemUp;
        beams.push({ chords: beam, stemUp });
        beam.forEach((i, at) => (chords[i] = { ...members[at]!, beam: index, stemUp: oneStaff ? stemUp : members[at]!.stemUp }));
      }
      beam = [];
    };

    for (const { group, index } of voice) {
      const mark = group[0].beams[0];
      if (mark === 'begin') closeBeam();
      if (mark === 'begin' || mark === 'continue' || mark === 'end') beam.push(index);
      else closeBeam();
      if (mark === 'end') closeBeam();

      const start = group.find((n) => n.tupletStart)?.tupletStart;
      if (start) {
        tuplet = {
          chords: [],
          number: group.find((n) => n.tuplet)?.tuplet?.actual ?? 3,
          showNumber: start.showNumber,
          bracket: start.bracket,
        };
      }
      tuplet?.chords.push(index);
      if (tuplet && group.some((n) => n.tupletStop)) {
        tuplets.push(finishTuplet(tuplet, chords));
        tuplet = null;
      }
    }
    closeBeam();
  }
  // Stems as written, unless two voices cross their stems (see untangleVoices); marks, ties and
  // slurs then follow the stems as drawn.
  const untangled = untangleVoices(chords, beams);
  const drawn = untangled.chords;
  const groupsInOrder = entries.map((entry) => entry.group);
  const marks = layoutMarks(score, groupsInOrder, drawn, written, rests);
  return {
    chords: drawn,
    octaveShifts: score.notation.octaveShifts.map(
      (shift): StaffOctaveShift => ({
        staff: shift.staff >= 2 ? 'bass' : 'treble',
        start: shift.start,
        end: shift.end,
        octaves: shift.octaves,
      }),
    ),
    beams: untangled.beams,
    tuplets: tuplets.map((tuplet) => ({ ...tuplet, above: drawn[tuplet.chords[0]!]!.stemUp })),
    rests: layoutRests(score, rests, written),
    ties: layoutTies(groupsInOrder, drawn),
    marks,
    slurs: layoutSlurs(groupsInOrder, drawn),
    graces: layoutGraces(score, drawn),
    ornaments: layoutOrnaments(score, groupsInOrder, drawn, marks),
    tremolos: layoutTremolos(groupsInOrder, drawn),
    arpeggios: layoutArpeggios(groupsInOrder, drawn),
  };
}

/** A bracket unless the whole group hangs from one beam; the number goes on the stem side. */
function finishTuplet(
  tuplet: { chords: number[]; number: number; showNumber: boolean; bracket: boolean | null },
  chords: readonly StaffChord[],
): Tuplet {
  const first = chords[tuplet.chords[0]!]!;
  const oneBeam = first.beam !== null && tuplet.chords.every((i) => chords[i]?.beam === first.beam);
  return {
    chords: tuplet.chords,
    number: tuplet.number,
    showNumber: tuplet.showNumber,
    bracket: tuplet.bracket ?? !oneBeam,
    above: first.stemUp,
  };
}
