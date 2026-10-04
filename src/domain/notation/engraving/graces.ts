import type { Score } from '../../score';
import { flagCount } from '../noteValue';
import { staffStep } from '../staffPosition';
import type { Clef } from '../written';
import { ledgerSteps } from './chords';
import type { Place, StaffChord, StaffGrace, StaffNote } from './types';

/* Grace notes: small notes before the note they lead to. */

/** Groups the printed grace notes by the place they lead to, and finds the chord there. */
export function layoutGraces(score: Score, chords: readonly StaffChord[], place: Place): StaffGrace[] {
  const groups: StaffGrace[] = [];
  // The group being gathered: its place, its slots (still being filled) and where its sound ends.
  let open = null as { key: string; slots: { notes: StaffNote[]; ledgerSteps: number[] }[]; end: number } | null;
  for (const grace of score.graces) {
    const staff: Clef = grace.staff >= 2 ? 'bass' : 'treble';
    const key = `${grace.bar}|${grace.beat}|${staff}`;
    const note: StaffNote = { step: staffStep(grace.pitch, grace.clef), accidental: grace.accidental };
    const end = grace.soundBeat + grace.soundBeats;
    if (open?.key === key) {
      const group = groups[groups.length - 1];
      if (grace.chord) open.slots[open.slots.length - 1].notes.push(note);
      else open.slots.push({ notes: [note], ledgerSteps: [] });
      open.end = Math.max(open.end, end);
      groups[groups.length - 1] = { ...group, slur: group.slur || grace.slur, beats: open.end - group.beat };
      continue;
    }
    const principal = chords.findIndex((chord) => chord.staff === staff && Math.abs(chord.beat - grace.beat) < 1e-6);
    open = { key, slots: [{ notes: [note], ledgerSteps: [] }], end };
    groups.push({
      staff,
      hand: grace.hand,
      bar: grace.bar,
      x: principal >= 0 ? chords[principal].x : place(grace.bar, grace.beat),
      principal: principal >= 0 ? principal : null,
      slots: open.slots,
      slash: grace.slash,
      beams: Math.max(1, flagCount(grace.value)),
      slur: grace.slur,
      beat: grace.soundBeat,
      beats: grace.soundBeats,
    });
  }
  for (const group of groups) {
    for (const slot of group.slots as { notes: StaffNote[]; ledgerSteps: number[] }[]) {
      slot.notes.sort((a, b) => a.step - b.step);
      slot.ledgerSteps = ledgerSteps(slot.notes[0].step, slot.notes[slot.notes.length - 1].step);
    }
  }
  return groups;
}
