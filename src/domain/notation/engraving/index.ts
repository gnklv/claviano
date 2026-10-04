import { barAtBeat, type Score } from '../../score';
import { groupBy } from '../../group';
import { staffStep } from '../staffPosition';
import { transcribe } from '../transcription';
import type { Clef, WrittenNote, WrittenRest } from '../written';
import { ledgerSteps, markHandCrossings, shiftVoicesApart, stemUpFor, untangleVoices, voiceKeys, withSeconds } from './chords';
import { layoutGraces } from './graces';
import { layoutArpeggios, layoutMarks, layoutOrnaments, layoutTremolos } from './marks';
import { layoutRests } from './rests';
import { layoutSlurs, layoutTies } from './slurs';
import type { Beam, NotationLayout, Place, StaffChord, StaffOctaveShift, Tuplet } from './types';

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
 * Nothing here is in pixels or knows how the page is drawn. Horizontal places are whatever the
 * caller's `place` gives for a bar and a beat: the engraving only says "at this note's place".
 */

export type * from './types';
export { ledgerSteps, shiftVoicesApart, untangleVoices, withSeconds } from './chords';

/**
 * Engraves a score: its notation, set on the staves. A score with only its played notes (MIDI) is
 * written down first (see transcribe).
 */
export function engrave(score: Score, place: Place): NotationLayout {
  const notated = score.written && score.written.length > 0 ? score : { ...score, ...transcribe(score) };
  const layout = layoutWritten(notated, notated.written ?? [], notated.rests, place);
  // Stem directions are final only now (beams may have changed them): place the heads of seconds.
  return { ...layout, chords: shiftVoicesApart(layout.chords.map(withSeconds)) };
}

/**
 * Lays out printed notes exactly as written: values, accidentals, stems, beams and
 * tuplets come from the file, and pitches sit where the clef in force puts them.
 */
function layoutWritten(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[], place: Place): NotationLayout {
  // A note marked as a chord shares the stem of the note before it.
  const groups: WrittenNote[][] = [];
  for (const note of written) {
    if (note.chord && groups.length > 0) groups[groups.length - 1].push(note);
    else groups.push([note]);
  }

  const voiceOf = voiceKeys(written);
  const entries = groups.map((group) => {
    const first = group[0];
    const staff: Clef = first.staff >= 2 ? 'bass' : 'treble';
    const bar = barAtBeat(score, first.beat);
    const notes = group
      // The clef in force (not the staff) decides where a pitch sits.
      .map((note) => ({ step: staffStep(note.pitch, note.clef), accidental: note.accidental }))
      .sort((a, b) => a.step - b.step);
    const top = notes[0].step;
    const bottom = notes[notes.length - 1].step;
    const chord: StaffChord = {
      staff,
      hand: first.hand,
      x: place(bar, first.beat),
      beat: first.beat,
      beats: Math.max(...group.map((n) => n.beats)),
      bar,
      beam: null,
      handMark: false,
      notes,
      duration: first.duration,
      stemUp: first.stem ? first.stem === 'up' : stemUpFor(top, bottom),
      ledgerSteps: ledgerSteps(top, bottom),
      start: Math.min(...group.map((n) => n.start)),
      end: Math.max(...group.map((n) => n.end)),
    };
    return { chord, group, voice: voiceOf(first) };
  });
  entries.sort((a, b) => a.chord.beat - b.chord.beat || a.chord.start - b.chord.start);
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
        const oneStaff = beam.every((i) => chords[i].staff === chords[beam[0]].staff);
        const written = entries[beam[0]].group[0].stem;
        const steps = beam.flatMap((i) => chords[i].notes.map((n) => n.step));
        const stemUp = written ? written === 'up' : oneStaff ? stemUpFor(Math.min(...steps), Math.max(...steps)) : chords[beam[0]].stemUp;
        beams.push({ chords: beam, stemUp });
        for (const i of beam) chords[i] = { ...chords[i], beam: index, stemUp: oneStaff ? stemUp : chords[i].stemUp };
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
    octaveShifts: score.octaveShifts.map(
      (shift): StaffOctaveShift => ({
        staff: shift.staff >= 2 ? 'bass' : 'treble',
        from: place(barAtBeat(score, shift.start), shift.start),
        to: place(barAtBeat(score, shift.end), shift.end),
        octaves: shift.octaves,
      }),
    ),
    beams: untangled.beams,
    tuplets: tuplets.map((tuplet) => ({ ...tuplet, above: drawn[tuplet.chords[0]].stemUp })),
    rests: layoutRests(score, rests, written, place),
    ties: layoutTies(groupsInOrder, drawn),
    marks,
    slurs: layoutSlurs(groupsInOrder, drawn),
    graces: layoutGraces(score, drawn, place),
    ornaments: layoutOrnaments(score, groupsInOrder, drawn, marks, place),
    tremolos: layoutTremolos(groupsInOrder, drawn),
    arpeggios: layoutArpeggios(groupsInOrder, drawn),
  };
}

/** A bracket unless the whole group hangs from one beam; the number goes on the stem side. */
function finishTuplet(
  tuplet: { chords: number[]; number: number; showNumber: boolean; bracket: boolean | null },
  chords: readonly StaffChord[],
): Tuplet {
  const beam = chords[tuplet.chords[0]].beam;
  const oneBeam = beam !== null && tuplet.chords.every((i) => chords[i].beam === beam);
  return {
    chords: tuplet.chords,
    number: tuplet.number,
    showNumber: tuplet.showNumber,
    bracket: tuplet.bracket ?? !oneBeam,
    above: chords[tuplet.chords[0]].stemUp,
  };
}
