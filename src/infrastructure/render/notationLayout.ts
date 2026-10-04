import type { Hand } from '../../domain/note';
import { flagCount, type WrittenDuration } from '../../domain/notation/noteValue';
import type { OrnamentKind } from '../../domain/notation/ornaments';
import type { Accidental } from '../../domain/notation/spelling';
import { BOTTOM_LINE_STEP, HOME_STAFF, MIDDLE_LINE_STEP, staffStep } from '../../domain/notation/staffPosition';
import { transcribe } from '../../domain/notation/transcription';
import type { Articulation, WrittenNote, WrittenRest } from '../../domain/notation/written';
import { barAtBeat, type Score } from '../../domain/score';
import { lastAtOrBefore } from '../../domain/search';
import { beatPosition, tapeBars, type Clef } from './staffLayout';

/** One notehead of a chord. */
export interface StaffNote {
  /** Staff step: half spaces from the top line down (see staffLayout). */
  readonly step: number;
  readonly accidental: Accidental | null;
  /**
   * Drawn on the other side of the stem. Two notes a second apart cannot sit side by side on one
   * stem, so one of them moves over: the upper one to the right of an up-stem, the lower one to
   * the left of a down-stem.
   */
  readonly displaced?: boolean;
}

/** Notes on one staff that start together and look the same share a stem: a chord (or a single note). */
export interface StaffChord {
  readonly staff: Clef;
  readonly hand: Hand;
  /** Horizontal place in bar units, like the tape: 2.5 is the middle of the third bar. */
  readonly x: number;
  /** Start and length along the page, in quarter notes, and the printed bar it is in. */
  readonly beat: number;
  readonly beats: number;
  readonly bar: number;
  /** Index of the beam joining it to its neighbours (see NotationLayout.beams), if any. */
  readonly beam: number | null;
  /**
   * Set on the first chord after a hand moves to the other staff, where the score writes
   * "L.H." / "R.H." (л. р. / п. р.) so the reader knows which hand plays it.
   */
  readonly handMark: boolean;
  /**
   * Moved right by a notehead's width: the up-stem voice where two voices on one staff meet a
   * second apart, so their heads do not sit on each other.
   */
  readonly voiceShift?: boolean;
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

/** A sign at a chord: an articulation or a fermata. */
export interface StaffMark {
  readonly chord: number;
  readonly kind: Articulation | 'fermata';
  readonly above: boolean;
  /** Vertical reference of the glyph, in staff steps. */
  readonly step: number;
}

/** A phrasing slur (legato) from one chord to another. */
export interface StaffSlur {
  readonly from: number;
  readonly to: number;
  readonly above: boolean;
  /** Chords on the same staff between its ends, which it must pass clear of. */
  readonly between: readonly number[];
}

/** An octave shift bracket (8va, 8vb…) over or under the notes from `from` to `to` (bar units). */
export interface StaffOctaveShift {
  readonly staff: Clef;
  readonly from: number;
  readonly to: number;
  /** How many octaves lower the notes are printed than they sound (negative: higher, as 8vb). */
  readonly octaves: number;
}

/** An ornament sign over (or under) a chord: a trill, a mordent, a turn. */
export interface StaffOrnament {
  readonly chord: number;
  readonly kind: OrnamentKind;
  readonly above: boolean;
  /** Where the sign is, in bar units: over the note, or after it for a delayed turn. */
  readonly x: number;
  /** Vertical reference of the sign, in staff steps: the edge nearest the notes. */
  readonly step: number;
  /** Small accidentals over and under the sign. */
  readonly accidentalAbove: Accidental | null;
  readonly accidentalBelow: Accidental | null;
  /** Where a trill's wavy line ends, in bar units; null without one. */
  readonly lineTo: number | null;
}

/** Tremolo strokes: on a chord's stem, or between it and the chord `to`. */
export interface StaffTremolo {
  readonly chord: number;
  readonly strokes: number;
  readonly to: number | null;
}

/** A rolled chord: a wavy line before these chords (one on each staff when the roll goes through both hands). */
export interface StaffArpeggio {
  readonly chords: readonly number[];
  readonly down: boolean;
}

/**
 * Grace notes before one note (or after the last note of a bar): small notes drawn to the left of
 * the place they lead to, on one stem direction, beamed together when there are several.
 */
export interface StaffGrace {
  readonly staff: Clef;
  readonly hand: Hand;
  readonly bar: number;
  /** Where they lead to, in bar units: the note's place, or the end of the bar. */
  readonly x: number;
  /** The chord they lead to (an index into NotationLayout.chords); null after the last note of a bar. */
  readonly principal: number | null;
  /** The grace notes left to right; each may be a chord (notes sorted from the top down). */
  readonly slots: readonly { readonly notes: readonly StaffNote[]; readonly ledgerSteps: readonly number[] }[];
  /** Struck through: an acciaccatura. */
  readonly slash: boolean;
  /** Flags on a lone grace note, beams on a group: 1 for eighths, 2 for sixteenths… */
  readonly beams: number;
  /** A slur joins them to the note they lead to. */
  readonly slur: boolean;
  /** When they sound along the page and for how long (all of them), for lighting them up. */
  readonly beat: number;
  readonly beats: number;
}

export interface NotationLayout {
  /** Sorted by their place on the page (beat). */
  readonly chords: readonly StaffChord[];
  readonly octaveShifts: readonly StaffOctaveShift[];
  readonly beams: readonly Beam[];
  readonly tuplets: readonly Tuplet[];
  readonly rests: readonly StaffRest[];
  readonly ties: readonly Tie[];
  readonly marks: readonly StaffMark[];
  readonly slurs: readonly StaffSlur[];
  readonly graces: readonly StaffGrace[];
  readonly ornaments: readonly StaffOrnament[];
  readonly tremolos: readonly StaffTremolo[];
  readonly arpeggios: readonly StaffArpeggio[];
}

/**
 * Turns a score into what the staff draws: its notation, laid out. A score with only its played
 * notes (MIDI) is written down first, by the domain's rules (see transcribe).
 */
export function layoutNotation(score: Score): NotationLayout {
  const notated = score.written && score.written.length > 0 ? score : { ...score, ...transcribe(score) };
  const layout = layoutWritten(notated, notated.written ?? [], notated.rests);
  // Stem directions are final only now (beams may have changed them): place the heads of seconds.
  return { ...layout, chords: shiftVoicesApart(layout.chords.map(withSeconds)) };
}

/**
 * Two voices on one staff at once should point their stems apart: the upper one up, the lower one
 * down. Files sometimes have it the other way round, typically where a voice crosses in from the
 * other staff (the Moonlight Sonata's triplets coming down into the bass over a low G♯); then the
 * stems of both voices cross each other and their beams. Where a stem-down voice stands wholly
 * above a stem-up voice (every note of it higher), side by side on the tape, both turn round, a
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
function voiceKeys(written: readonly WrittenNote[]): (note: WrittenNote) => string {
  const stavesAt = new Map<string, Set<number>>(); // "voice|beat" → staves
  for (const note of written) {
    const key = `${note.voice}|${note.beat}`;
    stavesAt.set(key, (stavesAt.get(key) ?? new Set<number>()).add(note.staff));
  }
  const perStaff = new Set<string>();
  for (const [key, staves] of stavesAt) if (staves.size > 1) perStaff.add(key.split('|')[0]);
  return (note) => (perStaff.has(note.voice) ? `${note.staff}|${note.voice}` : note.voice);
}

/**
 * Lays out printed notes exactly as written: values, accidentals, stems, beams and
 * tuplets come from the file, and pitches sit where the clef in force puts them.
 */
function layoutWritten(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[]): NotationLayout {
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
      x: beatPosition(score, bar, first.beat),
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
        from: beatPosition(score, barAtBeat(score, shift.start), shift.start),
        to: beatPosition(score, barAtBeat(score, shift.end), shift.end),
        octaves: shift.octaves,
      }),
    ),
    beams: untangled.beams,
    tuplets: tuplets.map((tuplet) => ({ ...tuplet, above: drawn[tuplet.chords[0]].stemUp })),
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

/**
 * Ornament signs go outside the staff, over the chord (under it when the file says so), clear of
 * its notes, its stem and the articulations and fermata on that side.
 */
function layoutOrnaments(
  score: Score,
  groups: readonly (readonly WrittenNote[])[],
  chords: readonly StaffChord[],
  marks: readonly StaffMark[],
): StaffOrnament[] {
  const ornaments: StaffOrnament[] = [];
  groups.forEach((group, index) => {
    const chord = chords[index];
    const note = group.find((member) => member.ornaments.length > 0);
    if (!note) return;
    const top = chord.notes[0].step;
    const bottom = chord.notes[chord.notes.length - 1].step;
    const stemmed = chord.duration.value !== 'whole';
    // Several signs on one note stack outward.
    const reached = { above: Infinity, below: -Infinity };
    for (const mark of note.ornaments) {
      const above = !mark.below;
      const extremes = [above ? top : bottom, above ? reached.above : reached.below];
      if (stemmed && chord.stemUp === above) extremes.push(above ? top - STEM_STEPS : bottom + STEM_STEPS);
      for (const other of marks) {
        // A fermata's arc is about three steps tall beyond its reference.
        if (other.chord === index && other.above === above) extremes.push(other.step + (other.kind === 'fermata' ? (above ? -3 : 3) : 0));
      }
      const outermost = above ? Math.min(...extremes.filter(Number.isFinite)) : Math.max(...extremes.filter(Number.isFinite));
      const step = above ? Math.min(TOP_LINE_STEP - 3, outermost - 3) : Math.max(BOTTOM_LINE_STEP + 3, outermost + 3);
      // A sign is about four steps tall.
      if (above) reached.above = step - 4;
      else reached.below = step + 4;
      const delayed = mark.kind === 'delayed-turn' || mark.kind === 'delayed-inverted-turn';
      const barEnd = (score.writtenBarBeats[chord.bar + 1] ?? score.writtenEndBeat) - 1e-9;
      ornaments.push({
        chord: index,
        kind: mark.kind,
        above,
        x: delayed ? beatPosition(score, chord.bar, Math.min(chord.beat + chord.beats / 2, barEnd)) : chord.x,
        step,
        accidentalAbove: mark.accidentalAbove,
        accidentalBelow: mark.accidentalBelow,
        lineTo: mark.kind === 'trill' && note.trillLine ? beatPosition(score, chord.bar, Math.min(chord.beat + chord.beats, barEnd)) : null,
      });
    }
  });
  return ornaments;
}

/** Tremolo strokes: on the chord's own stem, or towards the next chord of its voice that ends the tremolo. */
function layoutTremolos(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): StaffTremolo[] {
  const tremolos: StaffTremolo[] = [];
  groups.forEach((group, index) => {
    const tremolo = group.find((note) => note.tremolo)?.tremolo;
    if (!tremolo || tremolo.type === 'stop') return;
    if (tremolo.type === 'single') {
      tremolos.push({ chord: index, strokes: tremolo.strokes, to: null });
      return;
    }
    const { staff, voice } = group[0];
    const to = groups.findIndex(
      (other, i) => i !== index && chords[i].beat > chords[index].beat && other[0].staff === staff && other[0].voice === voice && other.some((note) => note.tremolo?.type === 'stop'),
    );
    if (to >= 0) tremolos.push({ chord: index, strokes: tremolo.strokes, to });
  });
  return tremolos;
}

/** Rolled chords: the chords marked with an arpeggio sign that start together share one wavy line. */
function layoutArpeggios(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): StaffArpeggio[] {
  const byBeat = new Map<string, { chords: number[]; down: boolean }>();
  groups.forEach((group, index) => {
    const direction = group.find((note) => note.arpeggio)?.arpeggio;
    if (!direction) return;
    const key = chords[index].beat.toFixed(6);
    const entry = byBeat.get(key) ?? { chords: [], down: direction === 'down' };
    entry.chords.push(index);
    byBeat.set(key, entry);
  });
  return [...byBeat.values()];
}

/** Groups the printed grace notes by the place they lead to, and finds the chord there. */
function layoutGraces(score: Score, chords: readonly StaffChord[]): StaffGrace[] {
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
      x: principal >= 0 ? chords[principal].x : beatPosition(score, grace.bar, grace.beat),
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

/** Voices present on each staff in each bar ("staff|bar" → voices), for two-voice rules. */
function voicesByStaffAndBar(score: Score, written: readonly WrittenNote[], rests: readonly WrittenRest[]): Map<string, Set<string>> {
  const voices = new Map<string, Set<string>>();
  for (const item of [...written, ...rests]) {
    const key = `${item.staff}|${barAtBeat(score, item.beat)}`;
    voices.set(key, (voices.get(key) ?? new Set<string>()).add(item.voice));
  }
  return voices;
}

/** Articulations that sit right at the notehead come first; accents stack outside them. */
const CLOSE_ARTICULATIONS: readonly Articulation[] = ['staccato', 'staccatissimo', 'tenuto', 'portato'];
const OUTER_ARTICULATIONS: readonly Articulation[] = ['accent', 'marcato'];
/** A stem is 3.5 spaces: 7 steps. */
const STEM_STEPS = 7;
const TOP_LINE_STEP = 0;

/**
 * Where articulations and fermatas go. Articulations sit on the notehead side (away from the stem),
 * one space from the note, and dots and dashes move off a line into the next space; with two
 * voices on the staff they go on the stem side instead, so each voice keeps its own. Several
 * articulations stack outward. A fermata goes above the staff (under it when inverted), clear of
 * everything else.
 */
function layoutMarks(
  score: Score,
  groups: readonly (readonly WrittenNote[])[],
  chords: readonly StaffChord[],
  written: readonly WrittenNote[],
  rests: readonly WrittenRest[],
): StaffMark[] {
  const voices = voicesByStaffAndBar(score, written, rests);
  const marks: StaffMark[] = [];
  groups.forEach((group, index) => {
    const chord = chords[index];
    const articulations = new Set(group.flatMap((note) => note.articulations));
    const fermata = group.find((note) => note.fermata)?.fermata ?? null;
    if (articulations.size === 0 && !fermata) return;

    const top = chord.notes[0].step;
    const bottom = chord.notes[chord.notes.length - 1].step;
    const stemmed = chord.duration.value !== 'whole';
    const twoVoices = (voices.get(`${group[0].staff}|${chord.bar}`)?.size ?? 0) > 1;
    const above = twoVoices ? chord.stemUp : !chord.stemUp;
    const direction = above ? -1 : 1;
    const onStemSide = stemmed && above === chord.stemUp;
    let step = onStemSide ? (above ? top - STEM_STEPS : bottom + STEM_STEPS) : above ? top : bottom;

    const ordered = [...CLOSE_ARTICULATIONS, ...OUTER_ARTICULATIONS].filter((a) => articulations.has(a));
    for (const kind of ordered) {
      step += 2 * direction;
      const onLineInsideStaff = step % 2 === 0 && step >= TOP_LINE_STEP && step <= BOTTOM_LINE_STEP;
      if (CLOSE_ARTICULATIONS.includes(kind) && onLineInsideStaff) step += direction;
      marks.push({ chord: index, kind, above, step });
    }

    if (fermata) {
      const upright = fermata === 'upright';
      // Clear of the notes, the stem and the articulations on that side, and outside the staff.
      const extremes = [upright ? top : bottom];
      if (stemmed && chord.stemUp === upright) extremes.push(upright ? top - STEM_STEPS : bottom + STEM_STEPS);
      if (above === upright) extremes.push(step);
      const outermost = upright ? Math.min(...extremes) : Math.max(...extremes);
      marks.push({
        chord: index,
        kind: 'fermata',
        above: upright,
        step: upright ? Math.min(TOP_LINE_STEP - 3, outermost - 3) : Math.max(BOTTOM_LINE_STEP + 3, outermost + 3),
      });
    }
  });
  return marks;
}

/**
 * Phrasing slurs, matched by number from "start" to "stop". Placement comes from the file;
 * otherwise a slur goes under the noteheads when all its stems point up, and above when not.
 */
function layoutSlurs(groups: readonly (readonly WrittenNote[])[], chords: readonly StaffChord[]): StaffSlur[] {
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
      const between = chords
        .map((chord, i) => ({ chord, i }))
        .filter(({ chord, i }) => i !== start.from && i !== index && chord.staff === first.staff && chord.x > first.x && chord.x < last.x)
        .map(({ i }) => i);
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
