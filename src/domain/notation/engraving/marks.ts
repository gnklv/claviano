import { pageEnd, type Score } from '../../score';
import { firstAtOrAfter } from '../../search';
import { BOTTOM_LINE_STEP } from '../staffPosition';
import type { Articulation, WrittenChord, WrittenNote, WrittenRest } from '../written';
import { stepSpan, voicesByStaffAndBar } from './chords';
import type { StaffArpeggio, StaffChord, StaffMark, StaffOrnament, StaffTremolo } from './types';

/*
 * Signs at a note: articulations and fermatas, ornaments, tremolo strokes and the sign of a rolled
 * chord. On which side of the note each goes, and how far out.
 */

/** Articulations that sit right at the notehead come first; accents stack outside them. */
export const CLOSE_ARTICULATIONS: readonly Articulation[] = ['staccato', 'staccatissimo', 'tenuto', 'portato'];
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
export function layoutMarks(
  score: Score,
  groups: readonly WrittenChord[],
  chords: readonly StaffChord[],
  written: readonly WrittenNote[],
  rests: readonly WrittenRest[],
): StaffMark[] {
  const voices = voicesByStaffAndBar(score, written, rests);
  const marks: StaffMark[] = [];
  groups.forEach((group, index) => {
    const chord = chords[index]!;
    const articulations = new Set(group.flatMap((note) => note.articulations));
    const fermata = group.find((note) => note.fermata)?.fermata ?? null;
    if (articulations.size === 0 && !fermata) return;

    const { top, bottom } = stepSpan(chord.notes);
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
 * Ornament signs go outside the staff, over the chord (under it when the file says so), clear of
 * its notes, its stem and the articulations and fermata on that side.
 */
export function layoutOrnaments(
  score: Score,
  groups: readonly WrittenChord[],
  chords: readonly StaffChord[],
  marks: readonly StaffMark[],
): StaffOrnament[] {
  const ornaments: StaffOrnament[] = [];
  const marksOf = new Map<number, StaffMark[]>();
  for (const mark of marks) {
    const own = marksOf.get(mark.chord);
    if (own) own.push(mark);
    else marksOf.set(mark.chord, [mark]);
  }
  groups.forEach((group, index) => {
    const chord = chords[index]!;
    const note = group.find((member) => member.ornaments.length > 0);
    if (!note) return;
    const { top, bottom } = stepSpan(chord.notes);
    const stemmed = chord.duration.value !== 'whole';
    // Several signs on one note stack outward.
    const reached = { above: Infinity, below: -Infinity };
    for (const mark of note.ornaments) {
      const above = !mark.below;
      const extremes = [above ? top : bottom, above ? reached.above : reached.below];
      if (stemmed && chord.stemUp === above) extremes.push(above ? top - STEM_STEPS : bottom + STEM_STEPS);
      for (const other of marksOf.get(index) ?? []) {
        // A fermata's arc is about three steps tall beyond its reference.
        if (other.above === above) extremes.push(other.step + (other.kind === 'fermata' ? (above ? -3 : 3) : 0));
      }
      const outermost = above ? Math.min(...extremes.filter(Number.isFinite)) : Math.max(...extremes.filter(Number.isFinite));
      const step = above ? Math.min(TOP_LINE_STEP - 3, outermost - 3) : Math.max(BOTTOM_LINE_STEP + 3, outermost + 3);
      // A sign is about four steps tall.
      if (above) reached.above = step - 4;
      else reached.below = step + 4;
      const delayed = mark.kind === 'delayed-turn' || mark.kind === 'delayed-inverted-turn';
      const barEnd = (score.notation.bars[chord.bar + 1]?.start ?? pageEnd(score)) - 1e-9;
      ornaments.push({
        chord: index,
        kind: mark.kind,
        above,
        beat: delayed ? Math.min(chord.beat + chord.beats / 2, barEnd) : chord.beat,
        step,
        accidentalAbove: mark.accidentalAbove,
        accidentalBelow: mark.accidentalBelow,
        lineTo: mark.kind === 'trill' && note.trillLine ? Math.min(chord.beat + chord.beats, barEnd) : null,
      });
    }
  });
  return ornaments;
}

/** Tremolo strokes: on the chord's own stem, or towards the next chord of its voice that ends the tremolo. */
export function layoutTremolos(groups: readonly WrittenChord[], chords: readonly StaffChord[]): StaffTremolo[] {
  const tremolos: StaffTremolo[] = [];
  // The chords that end a tremolo, by staff and voice, in the order of the page.
  const stops = new Map<string, number[]>();
  const voiceOf = (group: WrittenChord) => `${group[0].staff}|${group[0].voice}`;
  groups.forEach((group, index) => {
    if (!group.some((note) => note.tremolo?.type === 'stop')) return;
    const own = stops.get(voiceOf(group));
    if (own) own.push(index);
    else stops.set(voiceOf(group), [index]);
  });
  groups.forEach((group, index) => {
    const tremolo = group.find((note) => note.tremolo)?.tremolo;
    if (!tremolo || tremolo.type === 'stop') return;
    if (tremolo.type === 'single') {
      tremolos.push({ chord: index, strokes: tremolo.strokes, to: null });
      return;
    }
    const ends = stops.get(voiceOf(group)) ?? [];
    // The first of them after this chord (chords are in the order of their beats).
    let next = firstAtOrAfter(ends, index + 1, (i) => i);
    const after = (at: number) => ends[at] !== undefined && chords[ends[at]]!.beat > chords[index]!.beat;
    while (next < ends.length && !after(next)) next++;
    const to = ends[next];
    if (to !== undefined) tremolos.push({ chord: index, strokes: tremolo.strokes, to });
  });
  return tremolos;
}

/** Rolled chords: the chords marked with an arpeggio sign that start together share one wavy line. */
export function layoutArpeggios(groups: readonly WrittenChord[], chords: readonly StaffChord[]): StaffArpeggio[] {
  const byBeat = new Map<string, { chords: number[]; down: boolean }>();
  groups.forEach((group, index) => {
    const direction = group.find((note) => note.arpeggio)?.arpeggio;
    if (!direction) return;
    const key = chords[index]!.beat.toFixed(6);
    const entry = byBeat.get(key) ?? { chords: [], down: direction === 'down' };
    entry.chords.push(index);
    byBeat.set(key, entry);
  });
  return [...byBeat.values()];
}
