import { noteEnd, type Hand } from '../../domain/note';
import { writtenDuration, type WrittenDuration } from '../../domain/notation/noteValue';
import { quantize } from '../../domain/notation/quantize';
import { barAccidentals, spell, type Accidental, type SpelledPitch } from '../../domain/notation/spelling';
import type { WrittenNote, WrittenRest } from '../../domain/notation/written';
import { barAtBeat, keySignatureAt, timeSignatureAt, type Score } from '../../domain/score';
import { groupBeams } from './beams';
import { beatPosition, tapeBars, type Clef } from './staffLayout';

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

/** A tuplet group: "3" over three notes played in the time of two. */
export interface Tuplet {
  /** Indices into NotationLayout.chords, left to right. */
  readonly chords: readonly number[];
  /** The number shown, e.g. 3 for a triplet. */
  readonly number: number;
  readonly showNumber: boolean;
  /** A bracket is drawn when the group is not one beam (or when the source asks for it). */
  readonly bracket: boolean;
  /** On the stem side: above when stems go up. */
  readonly above: boolean;
}

/** A rest on the tape. */
export interface StaffRest {
  /** Which staff it is on: 'treble' is the upper one, 'bass' the lower. */
  readonly staff: Clef;
  /** Horizontal centre, in bar units. */
  readonly x: number;
  /** Vertical reference of the glyph, in staff steps (see staffLayout). */
  readonly step: number;
  readonly duration: WrittenDuration;
}

/** A tie from a note of one chord to the same pitch in a later chord. */
export interface Tie {
  readonly from: number;
  readonly to: number;
  /** Staff step of the tied note. */
  readonly step: number;
  /** Curving up (above the note) or down. */
  readonly above: boolean;
}

export interface NotationLayout {
  /** Sorted by start time. */
  readonly chords: readonly StaffChord[];
  readonly beams: readonly Beam[];
  readonly tuplets: readonly Tuplet[];
  readonly rests: readonly StaffRest[];
  readonly ties: readonly Tie[];
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
 * Turns a score into what the staff draws. When the source carries notation (MusicXML), the
 * printed notes are laid out as written; otherwise (MIDI) the notation is inferred.
 */
export function layoutNotation(score: Score): NotationLayout {
  return score.written && score.written.length > 0
    ? layoutWritten(score, score.written, score.rests)
    : inferNotation(score);
}

/**
 * Infers notation from sounding notes (MIDI): quantization, spelling, accidentals by the rules,
 * note values, stem directions, ledger lines and beams by beat. No ties, rests or tuplets.
 */
function inferNotation(score: Score): NotationLayout {
  const placed: Placed[] = score.notes.map((note) => {
    const { beat, beats } = quantize(note.beat, note.beats);
    const bar = barAtBeat(score, beat);
    const spelled = spell(note.pitch, keySignatureAt(score, beat).fifths);
    return {
      staff: staffFor(note.hand, spelled),
      hand: note.hand,
      bar,
      beat,
      x: beatPosition(score, bar, beat),
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
  return { chords: beamed, beams, tuplets: [], rests: [], ties: [] };
}

/**
 * Lays out printed notes (MusicXML) exactly as written: values, accidentals, stems, beams and
 * tuplets come from the file, and pitches sit where the clef in force puts them.
 */
function layoutWritten(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[]): NotationLayout {
  // A note marked as a chord shares the stem of the note before it.
  const groups: WrittenNote[][] = [];
  for (const note of written) {
    if (note.chord && groups.length > 0) groups[groups.length - 1].push(note);
    else groups.push([note]);
  }

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
      x: beatPosition(score, bar, first.beat),
      beat: first.beat,
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
    return { chord, group, voice: `${first.staff}|${first.voice}` };
  });
  entries.sort((a, b) => a.chord.start - b.chord.start || a.chord.beat - b.chord.beat);
  const chords = entries.map((entry) => entry.chord);

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
        beams.push({ chords: beam, stemUp: chords[beam[0]].stemUp });
        for (const i of beam) chords[i] = { ...chords[i], beam: index };
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
  return {
    chords,
    beams,
    tuplets,
    rests: layoutRests(score, rests, written),
    ties: layoutTies(entries.map((entry) => entry.group), chords),
  };
}

/** Rest positions by the usual rules; see restStep. */
const WHOLE_REST_STEP = 2; // hangs from the fourth line
const OTHER_REST_STEP = MIDDLE_LINE_STEP; // centred on the middle line
/** In a bar with two voices on one staff, rests move this far out of the way (two spaces). */
const VOICE_REST_SHIFT = 4;

/**
 * Where rests go. A whole-bar rest sits in the middle of its bar. Vertically: where the engraver
 * put it if the file says; otherwise a whole rest hangs from the fourth line and others centre on
 * the middle line, moved up for the upper voice and down for the lower one when two voices share
 * the staff in that bar.
 */
function layoutRests(score: Score, rests: readonly WrittenRest[], written: readonly WrittenNote[]): StaffRest[] {
  const voicesInBar = new Map<string, Set<string>>();
  const note = (staff: number, beat: number, voice: string) => {
    const key = `${staff}|${barAtBeat(score, beat)}`;
    voicesInBar.set(key, (voicesInBar.get(key) ?? new Set<string>()).add(voice));
  };
  for (const n of written) note(n.staff, n.beat, n.voice);
  for (const r of rests) note(r.staff, r.beat, r.voice);

  const bars = tapeBars(score);
  return rests.map((rest): StaffRest => {
    const bar = barAtBeat(score, rest.beat);
    const duration = rest.measure ? { value: 'whole' as const, dots: 0 as const } : rest.duration;
    let step: number;
    if (rest.displayPitch) {
      step = staffStep({ ...rest.displayPitch, alteration: 0 }, rest.clef);
    } else {
      step = duration.value === 'whole' ? WHOLE_REST_STEP : OTHER_REST_STEP;
      const voices = [...(voicesInBar.get(`${rest.staff}|${bar}`) ?? [])].sort((a, b) => Number(a) - Number(b));
      if (voices.length > 1) step += voices.indexOf(rest.voice) === 0 ? -VOICE_REST_SHIFT : VOICE_REST_SHIFT;
    }
    return {
      staff: rest.staff >= 2 ? 'bass' : 'treble',
      x: rest.measure ? bars.starts[bar] + bars.widths[bar] / 2 : beatPosition(score, bar, rest.beat),
      step,
      duration,
    };
  });
}

/**
 * Ties join a note marked "tie start" to the next note of the same pitch on the same staff marked
 * "tie stop". A tie curves away from the stem; in a chord, upper notes tie above and lower below.
 */
function layoutTies(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): Tie[] {
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
      const target = refs.slice(i + 1).find((next) => next.note.tieStop && next.note.beat > ref.note.beat);
      if (!target) return;
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
