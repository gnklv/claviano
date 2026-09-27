import { noteEnd, type Hand } from '../../domain/note';
import { writtenDuration, type WrittenDuration } from '../../domain/notation/noteValue';
import { quantize } from '../../domain/notation/quantize';
import { barAccidentals, spell, type Accidental, type SpelledPitch } from '../../domain/notation/spelling';
import { barAtBeat, barLength, keySignatureAt, timeSignatureAt, type Score } from '../../domain/score';
import { groupBeams } from './beams';
import type { Clef } from './staffLayout';

/** One notehead of a chord. */
export interface StaffNote {
  /** Staff step: half spaces from the top line down (see staffLayout). */
  readonly step: number;
  readonly accidental: Accidental | null;
}

/** Notes on one staff that start together and look the same share a stem: a chord (or a single note). */
export interface StaffChord {
  readonly staff: Clef;
  readonly hand: Hand;
  /** Horizontal place in bar units, like the tape: 2.5 is the middle of the third bar. */
  readonly x: number;
  /** Start in quarter notes (quantized) and the bar it is in. */
  readonly beat: number;
  readonly bar: number;
  /** Index of the beam joining it to its neighbours (see NotationLayout.beams), if any. */
  readonly beam: number | null;
  /**
   * Set on the first chord after a hand moves to the other staff, where the score writes
   * "L.H." / "R.H." (л. р. / п. р.) so the reader knows which hand plays it.
   */
  readonly handMark: boolean;
  /** Sorted from the top of the staff down. */
  readonly notes: readonly StaffNote[];
  readonly duration: WrittenDuration;
  readonly stemUp: boolean;
  /** Steps that need a short extra line (above or below the staff). */
  readonly ledgerSteps: readonly number[];
  /** When it sounds, in seconds, for highlighting under the cursor. */
  readonly start: number;
  readonly end: number;
}

/** Chords whose stems are joined by beams; they share one stem direction. */
export interface Beam {
  /** Indices into NotationLayout.chords, left to right. */
  readonly chords: readonly number[];
  readonly stemUp: boolean;
}

export interface NotationLayout {
  /** Sorted by start time. */
  readonly chords: readonly StaffChord[];
  readonly beams: readonly Beam[];
}

/** The staff's top line as a diatonic index (octave × 7 + letter): Fa5 on treble, La3 on bass. */
const TOP_LINE: Record<Clef, number> = { treble: 5 * 7 + 3, bass: 3 * 7 + 5 };
const MIDDLE_LINE_STEP = 4;
const BOTTOM_LINE_STEP = 8;

export const staffStep = (pitch: SpelledPitch, clef: Clef): number => TOP_LINE[clef] - (pitch.octave * 7 + pitch.letter);

/** How many ledger lines a note at `step` needs. */
const ledgerLineCount = (step: number): number =>
  step < 0 ? Math.floor(-step / 2) : step > BOTTOM_LINE_STEP ? Math.floor((step - BOTTOM_LINE_STEP) / 2) : 0;

/** More ledger lines than this, and a note may move to the other staff. */
const MAX_LEDGER_LINES = 2;

/** Each hand's home staff. */
const HOME_STAFF: Record<Hand, Clef> = { right: 'treble', left: 'bass' };

/**
 * Right hand on the treble staff, left hand on the bass staff — unless the note is far outside
 * its staff (more than two ledger lines) and fits the other one better. Then it is written on the
 * other staff, as scores do when hands cross; a hand mark and its stem direction tell which hand
 * plays it.
 */
export function staffFor(hand: Hand, pitch: SpelledPitch): Clef {
  const own = HOME_STAFF[hand];
  const other: Clef = own === 'treble' ? 'bass' : 'treble';
  const ownLedgers = ledgerLineCount(staffStep(pitch, own));
  return ownLedgers > MAX_LEDGER_LINES && ledgerLineCount(staffStep(pitch, other)) < ownLedgers ? other : own;
}

interface Placed {
  readonly staff: Clef;
  readonly hand: Hand;
  readonly bar: number;
  readonly beat: number;
  readonly x: number;
  readonly pitch: number;
  readonly spelled: SpelledPitch;
  readonly duration: WrittenDuration;
  readonly start: number;
  readonly end: number;
  accidental: Accidental | null;
}

/**
 * Turns a score into what the staff draws: chords with notehead positions, accidentals, note
 * values, stem directions, ledger lines and beams. One voice per staff, no ties or rests yet.
 */
export function layoutNotation(score: Score): NotationLayout {
  const placed: Placed[] = score.notes.map((note) => {
    const { beat, beats } = quantize(note.beat, note.beats);
    const bar = barAtBeat(score, beat);
    const spelled = spell(note.pitch, keySignatureAt(score, beat).fifths);
    return {
      staff: staffFor(note.hand, spelled),
      hand: note.hand,
      bar,
      beat,
      x: bar + (beat - score.barBeats[bar]) / barLength(score, bar),
      pitch: note.pitch,
      spelled,
      duration: writtenDuration(beats),
      start: note.start,
      end: noteEnd(note),
      accidental: null,
    };
  });

  // Accidentals follow the rules per bar and per staff, in time order.
  for (const group of groupBy(placed, (p) => `${p.staff}|${p.bar}`).values()) {
    group.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
    const fifths = keySignatureAt(score, score.barBeats[group[0].bar]).fifths;
    barAccidentals(group.map((p) => p.spelled), fifths).forEach((accidental, i) => (group[i].accidental = accidental));
  }

  // Where both hands meet on one staff within a bar, they are written as two voices:
  // right hand stems up, left hand stems down, never sharing a stem or a beam.
  const handsInBar = new Map<string, Set<Hand>>();
  for (const p of placed) {
    const key = `${p.staff}|${p.bar}`;
    handsInBar.set(key, (handsInBar.get(key) ?? new Set<Hand>()).add(p.hand));
  }
  const voiceStem = (staff: Clef, bar: number, hand: Hand): boolean | null =>
    (handsInBar.get(`${staff}|${bar}`)?.size ?? 0) > 1 ? hand === 'right' : null;

  const chordGroups = groupBy(placed, (p) => `${p.staff}|${p.hand}|${p.beat}|${p.duration.value}|${p.duration.dots}`);
  const chords = [...chordGroups.values()].map(
    (group): StaffChord => {
      const notes = group
        .map((p) => ({ step: staffStep(p.spelled, p.staff), accidental: p.accidental }))
        .sort((a, b) => a.step - b.step);
      const top = notes[0].step;
      const bottom = notes[notes.length - 1].step;
      const { staff, hand, bar } = group[0];
      return {
        staff,
        hand,
        x: group[0].x,
        beat: group[0].beat,
        bar,
        beam: null,
        handMark: false,
        notes,
        duration: group[0].duration,
        stemUp: voiceStem(staff, bar, hand) ?? stemUpFor(top, bottom),
        ledgerSteps: ledgerSteps(top, bottom),
        start: Math.min(...group.map((p) => p.start)),
        end: Math.max(...group.map((p) => p.end)),
      };
    },
  );
  chords.sort((a, b) => a.start - b.start || a.beat - b.beat);
  markHandCrossings(chords);

  // Beams: groups of flagged chords of one hand; each group takes one stem direction.
  const groups = groupBeams(
    chords.map((chord) => ({
      staff: `${chord.staff}|${chord.hand}`,
      bar: chord.bar,
      beat: chord.beat,
      barBeat: score.barBeats[chord.bar],
      duration: chord.duration,
      timeSignature: timeSignatureAt(score, chord.beat),
    })),
  );
  const beamed = [...chords];
  const beams: Beam[] = groups.map((indices, beamIndex) => {
    const steps = indices.flatMap((i) => chords[i].notes.map((n) => n.step));
    const first = chords[indices[0]];
    const stemUp = voiceStem(first.staff, first.bar, first.hand) ?? stemUpFor(Math.min(...steps), Math.max(...steps));
    for (const i of indices) beamed[i] = { ...chords[i], stemUp, beam: beamIndex };
    return { chords: [...indices].sort((a, b) => chords[a].beat - chords[b].beat), stemUp };
  });
  return { chords: beamed, beams };
}

/**
 * Marks the first chord each time a hand moves onto the other hand's staff.
 * Chords must be in time order; they are changed in place.
 */
function markHandCrossings(chords: StaffChord[]): void {
  const lastStaff = new Map<Hand, Clef>();
  chords.forEach((chord, index) => {
    const away = chord.staff !== HOME_STAFF[chord.hand];
    const previous = lastStaff.get(chord.hand) ?? HOME_STAFF[chord.hand];
    if (away && previous !== chord.staff) chords[index] = { ...chord, handMark: true };
    lastStaff.set(chord.hand, chord.staff);
  });
}

/** The note farthest from the middle line decides: far above it → stem down. */
const stemUpFor = (top: number, bottom: number): boolean => bottom - MIDDLE_LINE_STEP > MIDDLE_LINE_STEP - top;

/** Extra lines on even steps (lines) beyond the staff, out to the farthest note. */
export function ledgerSteps(top: number, bottom: number): number[] {
  const steps: number[] = [];
  for (let step = -2; step >= top; step -= 2) steps.push(step);
  for (let step = BOTTOM_LINE_STEP + 2; step <= bottom; step += 2) steps.push(step);
  return steps;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
