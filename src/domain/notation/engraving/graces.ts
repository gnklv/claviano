import type { Score } from '../../score';
import { firstAtOrAfter } from '../../search';
import { flagCount } from '../noteValue';
import { staffStep } from '../staffPosition';
import type { Clef } from '../written';
import { ledgerSteps } from './chords';
import type { StaffChord, StaffGrace, StaffNote } from './types';

/* Grace notes: small notes before the note they lead to. */

/**
 * The printed grace notes, by the place they lead to and the staff they are on, with the chord
 * there. Each lights up while it sounds: from its group's time in the score (see GraceSound).
 */
export function layoutGraces(score: Score, chords: readonly StaffChord[]): StaffGrace[] {
  const groups: StaffGrace[] = [];
  // The chords of each staff, in the order of their beats: the one a group leads to is looked up there.
  const onStaff: Record<Clef, number[]> = { treble: [], bass: [] };
  chords.forEach((chord, index) => onStaff[chord.staff].push(index));
  const chordAt = (staff: Clef, beat: number): number | null => {
    const indices = onStaff[staff];
    const index = indices[firstAtOrAfter(indices, beat - 1e-6, (i) => chords[i].beat)] as number | undefined;
    return index !== undefined && Math.abs(chords[index].beat - beat) < 1e-6 ? index : null;
  };
  // The group being gathered: its place, its slots (still being filled) and where its sound ends.
  let open = null as { key: string; slots: { notes: StaffNote[]; ledgerSteps: number[] }[]; end: number } | null;
  score.notation.graces.forEach((written, index) => {
    const sound = score.graceSounds[index] ?? { beat: written.beat, each: 0 };
    let slot = -1;
    for (const grace of written.notes) {
      if (!grace.chord || slot < 0) slot++;
      const soundBeat = sound.beat + slot * sound.each;
      const staff: Clef = grace.staff >= 2 ? 'bass' : 'treble';
      const key = `${written.bar}|${written.beat}|${staff}`;
      const note: StaffNote = { step: staffStep(grace.pitch, grace.clef), accidental: grace.accidental };
      const end = soundBeat + sound.each;
      if (open?.key === key) {
        const group = groups[groups.length - 1];
        if (grace.chord) open.slots[open.slots.length - 1].notes.push(note);
        else open.slots.push({ notes: [note], ledgerSteps: [] });
        open.end = Math.max(open.end, end);
        groups[groups.length - 1] = { ...group, slur: group.slur || grace.slur, beats: open.end - group.beat };
        continue;
      }
      open = { key, slots: [{ notes: [note], ledgerSteps: [] }], end };
      groups.push({
        staff,
        hand: grace.hand,
        bar: written.bar,
        principal: chordAt(staff, written.beat),
        slots: open.slots,
        slash: grace.slash,
        beams: Math.max(1, flagCount(grace.value)),
        slur: grace.slur,
        beat: soundBeat,
        beats: sound.each,
      });
    }
  });
  for (const group of groups) {
    for (const slot of group.slots as { notes: StaffNote[]; ledgerSteps: number[] }[]) {
      slot.notes.sort((a, b) => a.step - b.step);
      slot.ledgerSteps = ledgerSteps(slot.notes[0].step, slot.notes[slot.notes.length - 1].step);
    }
  }
  return groups;
}
