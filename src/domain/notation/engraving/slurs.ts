import { lastAtOrBefore } from '../../search';
import { staffStep } from '../staffPosition';
import type { WrittenNote } from '../written';
import type { StaffChord, StaffSlur, Tie } from './types';

/* Curves between notes: ties (the same note held on) and slurs (a phrase played legato). */

/**
 * Ties join a note marked "tie start" to the next note of the same pitch on the same staff marked
 * "tie stop". A tie curves away from the stem; in a chord, upper notes tie above and lower below.
 */
export function layoutTies(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): Tie[] {
  type Ref = { note: WrittenNote; chord: number; step: number };
  const byPitch = new Map<string, Ref[]>();
  groups.forEach((group, chord) => {
    for (const note of group) {
      const key = `${note.staff}|${note.pitch.letter}|${note.pitch.octave}|${note.pitch.alteration}`;
      const refs = byPitch.get(key) ?? [];
      refs.push({ note, chord, step: staffStep(note.pitch, note.clef) });
      byPitch.set(key, refs);
    }
  });

  const ties: Tie[] = [];
  for (const refs of byPitch.values()) {
    refs.sort((a, b) => a.note.beat - b.note.beat);
    refs.forEach((ref, i) => {
      if (!ref.note.tieStart) return;
      let to = i + 1;
      while (to < refs.length && !(refs[to].note.tieStop && refs[to].note.beat > ref.note.beat)) to++;
      if (to === refs.length) return;
      const target = refs[to];
      const chord = chords[ref.chord];
      const index = chord.notes.findIndex((n) => n.step === ref.step);
      const count = chord.notes.length;
      const middle = count % 2 === 1 && index === (count - 1) / 2;
      ties.push({
        from: ref.chord,
        to: target.chord,
        step: ref.step,
        above: count === 1 || middle ? !chord.stemUp : index < count / 2,
      });
    });
  }
  return ties;
}

/**
 * Phrasing slurs, matched by number from "start" to "stop". Placement comes from the file;
 * otherwise a slur goes under the noteheads when all its stems point up, and above when not.
 */
export function layoutSlurs(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): StaffSlur[] {
  const open = new Map<number, { from: number; placement: 'above' | 'below' | null }>();
  const slurs: StaffSlur[] = [];
  groups.forEach((group, index) => {
    const marks = group.flatMap((note) => note.slurs);
    // A chord can end one slur and start the next: close first.
    for (const mark of marks.filter((m) => m.type === 'stop')) {
      const start = open.get(mark.number);
      if (!start) continue;
      open.delete(mark.number);
      const first = chords[start.from];
      const last = chords[index];
      // The chords after its first beat and before its last (chords are in the order of their beats).
      const between: number[] = [];
      for (let i = lastAtOrBefore(chords, first.beat, (chord) => chord.beat) + 1; i < chords.length && chords[i].beat < last.beat; i++) {
        if (chords[i].staff === first.staff) between.push(i);
      }
      const allStemsUp = [start.from, ...between, index].every((i) => chords[i].stemUp);
      slurs.push({
        from: start.from,
        to: index,
        above: start.placement ? start.placement === 'above' : !allStemsUp,
        between,
      });
    }
    for (const mark of marks.filter((m) => m.type === 'start')) open.set(mark.number, { from: index, placement: mark.placement });
  });
  return slurs;
}
