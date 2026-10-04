import type { Hand } from '../../note';
import { barAtBeat, type Score } from '../../score';
import { lastAtOrBefore } from '../../search';
import { BOTTOM_LINE_STEP, HOME_STAFF, MIDDLE_LINE_STEP } from '../staffPosition';
import type { Clef, WrittenNote, WrittenRest } from '../written';
import type { Beam, StaffChord } from './types';

/*
 * Chords on the staff: which way a stem points, which lines a note beyond the staff needs, how
 * the heads of a second share a stem, and how two voices on one staff keep out of each other's way.
 */

/** The note farthest from the middle line decides: far above it → stem down. */
export const stemUpFor = (top: number, bottom: number): boolean => bottom - MIDDLE_LINE_STEP > MIDDLE_LINE_STEP - top;

/** Extra lines on even steps (lines) beyond the staff, out to the farthest note. */
export function ledgerSteps(top: number, bottom: number): number[] {
  const steps: number[] = [];
  for (let step = -2; step >= top; step -= 2) steps.push(step);
  for (let step = BOTTOM_LINE_STEP + 2; step <= bottom; step += 2) steps.push(step);
  return steps;
}

/**
 * Moves one note of each second to the other side of the stem. Going from the note at the stem's
 * far end (the bottom for an up-stem, the top for a down-stem), a note a step away from one that
 * stayed in place moves over; in a cluster (Do–Re–Mi) the heads alternate.
 */
export function withSeconds(chord: StaffChord): StaffChord {
  if (chord.notes.length < 2) return chord;
  // Notes are sorted from the top down; walk from the stem's far end.
  const order = chord.stemUp ? [...chord.notes].reverse() : [...chord.notes];
  let previous: { step: number; displaced: boolean } | null = null;
  const placed = order.map((note) => {
    const displaced = previous !== null && !previous.displaced && Math.abs(previous.step - note.step) === 1;
    previous = { step: note.step, displaced };
    return displaced ? { ...note, displaced } : note;
  });
  if (!placed.some((note) => note.displaced)) return chord;
  return { ...chord, notes: chord.stemUp ? placed.reverse() : placed };
}

/**
 * How to tell voices apart. Most files number the voices of the two staves apart (MuseScore 1–4
 * and 5–8), and a voice may cross to the other staff inside one beam, as the Moonlight Sonata's
 * triplets do: then the number alone is the voice. Other files start from 1 on each staff; a
 * number heard on both staves at the same moment is such a per-staff number, and goes with its staff.
 */
export function voiceKeys(written: readonly WrittenNote[]): (note: WrittenNote) => string {
  const stavesAt = new Map<string, Set<number>>(); // "voice|beat" → staves
  for (const note of written) {
    const key = `${note.voice}|${note.beat}`;
    stavesAt.set(key, (stavesAt.get(key) ?? new Set<number>()).add(note.staff));
  }
  const perStaff = new Set<string>();
  for (const [key, staves] of stavesAt) if (staves.size > 1) perStaff.add(key.split('|')[0]);
  return (note) => (perStaff.has(note.voice) ? `${note.staff}|${note.voice}` : note.voice);
}

/** Voices present on each staff in each bar ("staff|bar" → voices), for two-voice rules. */
export function voicesByStaffAndBar(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[]): Map<string, Set<string>> {
  const voices = new Map<string, Set<string>>();
  for (const item of [...written, ...rests]) {
    const key = `${item.staff}|${barAtBeat(score, item.beat)}`;
    voices.set(key, (voices.get(key) ?? new Set<string>()).add(item.voice));
  }
  return voices;
}

/**
 * Two voices on one staff at once should point their stems apart: the upper one up, the lower one
 * down. Files sometimes have it the other way round, typically where a voice crosses in from the
 * other staff (the Moonlight Sonata's triplets coming down into the bass over a low G♯); then the
 * stems of both voices cross each other and their beams. Where a stem-down voice stands wholly
 * above a stem-up voice (every note of it higher), side by side on the page, both turn round, a
 * beamed group as a whole.
 */
export function untangleVoices(chords: readonly StaffChord[], beams: readonly Beam[]): { chords: StaffChord[]; beams: Beam[] } {
  // A beamed group moves as one; other chords on their own. Whole notes have no stems to cross,
  // and a beam across both staves already points its stems apart.
  const units: { chords: number[]; beam: number | null }[] = [
    ...beams.map((beam, index) => ({ chords: [...beam.chords], beam: index })),
    ...chords.flatMap((chord, index) => (chord.beam === null ? [{ chords: [index], beam: null }] : [])),
  ];
  const described = units
    .map((unit) => {
      const members = unit.chords.map((i) => chords[i]);
      const steps = members.flatMap((c) => c.notes.map((n) => n.step));
      return {
        ...unit,
        staff: members[0].staff,
        stemUp: members[0].stemUp,
        // Where it is drawn: from its first chord to its last (stems cross only side by side).
        first: Math.min(...members.map((c) => c.beat)),
        last: Math.max(...members.map((c) => c.beat)),
        // Steps grow downwards: `top` is the highest note, `bottom` the lowest.
        top: Math.min(...steps),
        bottom: Math.max(...steps),
        mixed: members.some((c) => c.stemUp !== members[0].stemUp || c.staff !== members[0].staff),
        stemless: members.every((c) => c.duration.value === 'whole'),
      };
    })
    .filter((unit) => !unit.mixed && !unit.stemless);

  // Stem-up units by staff, in order, to look only at those near each stem-down one.
  const upsByStaff = new Map<StaffChord['staff'], (typeof described)[number][]>();
  for (const unit of described) {
    if (!unit.stemUp) continue;
    const ups = upsByStaff.get(unit.staff);
    if (ups) ups.push(unit);
    else upsByStaff.set(unit.staff, [unit]);
  }
  const longest = new Map<StaffChord['staff'], number>();
  for (const [staff, ups] of upsByStaff) {
    ups.sort((a, b) => a.first - b.first);
    longest.set(staff, Math.max(...ups.map((u) => u.last - u.first)));
  }

  const flip = new Set<(typeof described)[number]>();
  for (const down of described) {
    if (down.stemUp) continue;
    const ups = upsByStaff.get(down.staff) ?? [];
    // Drawn over the same stretch (one after the other is how a single voice turns its stems):
    // starts by the down unit's end, and no earlier than the longest up unit could still reach it.
    const earliest = down.first - (longest.get(down.staff) ?? 0);
    for (let i = lastAtOrBefore(ups, down.last, (u) => u.first); i >= 0 && ups[i].first >= earliest; i--) {
      const up = ups[i];
      // Only a voice wholly above the other: a melody that dips to its accompaniment's note keeps its stems.
      if (up.last >= down.first && down.bottom < up.top) {
        flip.add(down);
        flip.add(up);
      }
    }
  }
  if (flip.size === 0) return { chords: [...chords], beams: [...beams] };

  const result = [...chords];
  const resultBeams = [...beams];
  for (const unit of flip) {
    for (const i of unit.chords) result[i] = { ...result[i], stemUp: !unit.stemUp };
    if (unit.beam !== null) resultBeams[unit.beam] = { ...resultBeams[unit.beam], stemUp: !unit.stemUp };
  }
  return { chords: result, beams: resultBeams };
}

/**
 * Two voices on one staff starting together: where a note of one is a second from a note of the
 * other, their heads would sit on each other, so one voice moves right by a head. With stems apart
 * it is the up-stem voice; with stems the same way, the voice with the upper note of the second
 * (as the upper note of a second in a chord goes right).
 */
export function shiftVoicesApart(chords: readonly StaffChord[]): StaffChord[] {
  const result = [...chords];
  const byPlace = new Map<string, number[]>();
  chords.forEach((chord, i) => {
    const key = `${chord.staff}|${chord.beat}`;
    byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
  });
  for (const indices of byPlace.values()) {
    for (const a of indices) {
      for (const b of indices) {
        if (a >= b) continue;
        // The second between them, if any: the upper note's chord and the lower one's.
        const pair = chords[a].notes.flatMap((x) => chords[b].notes.filter((y) => Math.abs(x.step - y.step) === 1).map((y) => [x, y]));
        if (pair.length === 0) continue;
        const [x, y] = pair[0];
        const upper = x.step < y.step ? a : b; // steps grow downwards
        const moved = chords[a].stemUp !== chords[b].stemUp ? (chords[a].stemUp ? a : b) : upper;
        result[moved] = { ...result[moved], voiceShift: true };
      }
    }
  }
  return result;
}

/**
 * Marks the first chord each time a hand moves onto the other hand's staff.
 * Chords must be in time order; they are changed in place.
 */
export function markHandCrossings(chords: StaffChord[]): void {
  const lastStaff = new Map<Hand, Clef>();
  chords.forEach((chord, index) => {
    const away = chord.staff !== HOME_STAFF[chord.hand];
    const previous = lastStaff.get(chord.hand) ?? HOME_STAFF[chord.hand];
    if (away && previous !== chord.staff) chords[index] = { ...chord, handMark: true };
    lastStaff.set(chord.hand, chord.staff);
  });
}
