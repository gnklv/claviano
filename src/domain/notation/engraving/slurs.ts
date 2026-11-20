import { lastAtOrBefore } from '../../search';
import { staffStep } from '../staffPosition';
import type { WrittenChord, WrittenNote } from '../written';
import type { StaffChord, StaffSlur, Tie } from './types';

/* Curves between notes: ties (the same note held on) and slurs (a phrase played legato). */

/**
 * Ties join a note marked "tie start" to the next note of the same pitch on the same staff marked
 * "tie stop". A tie curves away from the stem; in a chord, upper notes tie above and lower below.
 */
export function layoutTies(groups: readonly WrittenChord[], chords: readonly StaffChord[]): Tie[] {
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
      let target: Ref | undefined;
      for (let to = i + 1; to < refs.length && !target; to++) {
        const next = refs[to]!;
        if (next.note.tieStop && next.note.beat > ref.note.beat) target = next;
      }
      if (!target) return;
      const chord = chords[ref.chord]!;
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
export function layoutSlurs(groups: readonly WrittenChord[], chords: readonly StaffChord[]): StaffSlur[] {
  type OpenSlur = { from: number; placement: 'above' | 'below' | null };
  const open = new Map<number, Map<StaffChord['staff'], OpenSlur>>();
  const slurs: StaffSlur[] = [];
  // Close phrases on every staff and voice at this beat before opening any
  // new ones. The XML order of simultaneous chords can differ by edition.
  for (let firstIndex = 0; firstIndex < groups.length;) {
    let nextIndex = firstIndex + 1;
    while (nextIndex < chords.length && chords[nextIndex]!.beat === chords[firstIndex]!.beat) nextIndex++;
    const marks = groups.slice(firstIndex, nextIndex).flatMap((group, offset) =>
      group.flatMap(note => note.slurs.map(mark => ({ index: firstIndex + offset, mark }))));
    const stops = marks.filter(entry => entry.mark.type === 'stop');
    const onOwnStaff = ({ index, mark }: (typeof stops)[number]) =>
      Number(open.get(mark.number)?.has(chords[index]!.staff) ?? false);
    // Give each staff its own stops before matching a cross-staff ending.
    stops.sort((a, b) => onOwnStaff(b) - onOwnStaff(a));
    for (const { index, mark } of stops) {
      const pending = open.get(mark.number);
      if (!pending) continue;
      const staff = chords[index]!.staff;
      // Piano exports may reuse a number simultaneously on the two staves.
      // A lone start on the opposite staff can still end a cross-staff phrase.
      const start = pending.get(staff) ?? (pending.size === 1 ? [...pending.values()][0] : undefined);
      if (!start) continue;
      pending.delete(chords[start.from]!.staff);
      const first = chords[start.from]!;
      const last = chords[index]!;
      // The chords after its first beat and before its last (chords are in the order of their beats).
      const between: number[] = [];
      for (let i = lastAtOrBefore(chords, first.beat, (chord) => chord.beat) + 1; i < chords.length && chords[i]!.beat < last.beat; i++) {
        if (chords[i]!.staff === first.staff) between.push(i);
      }
      const allStemsUp = [start.from, ...between, index].every((i) => chords[i]!.stemUp);
      slurs.push({
        from: start.from,
        to: index,
        above: start.placement ? start.placement === 'above' : !allStemsUp,
        between,
      });
    }
    for (const { index, mark } of marks.filter(entry => entry.mark.type === 'start')) {
      const pending = open.get(mark.number) ?? new Map<StaffChord['staff'], OpenSlur>();
      pending.set(chords[index]!.staff, { from: index, placement: mark.placement });
      open.set(mark.number, pending);
    }
    firstIndex = nextIndex;
  }
  return slurs;
}
