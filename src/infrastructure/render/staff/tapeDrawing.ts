import type { NotationLayout } from '../../../domain/notation/engraving';
import type { Hand } from '../../../domain/note';
import { drawBeam, drawChord, drawFingering, drawMark, drawRest, drawSlur, drawTie, drawTuplet } from './chords';
import type { StaffContext } from './context';
import { drawDynamics } from './dynamics';
import { drawGrace } from './graces';
import { drawBarLines, drawBarNumbers, drawClefChanges, drawNavigation, drawOctaveShift, drawSignatureChanges, drawTempoMarks, type OctaveBracket } from './markings';
import { drawArpeggio, drawOrnament, drawTremolo } from './ornaments';
import { drawPedal } from './pedal';
import { COLORS, group, type GroupShape, type Shape } from './shapes';

/*
 * The whole tape of a piece, as shapes: what the staff's surface draws.
 * What lights up is kept apart: each chord and each group of grace notes is a group of its own.
 */

export interface TapeDrawing {
  /** Bar lines, changes of key, time and clef: under everything else. */
  readonly lines: readonly Shape[];
  /** Rests and what goes around the notes (bar numbers, brackets, dynamics, pedals, words), in ink. */
  readonly rests: GroupShape;
  /** A group for each chord (by its index in the layout), lit as it sounds. */
  readonly chords: readonly GroupShape[];
  /** A group for each group of grace notes (by its index), lit as it sounds. */
  readonly graces: readonly GroupShape[];
  /** Beams, tuplets and slurs, in ink over the chords. */
  readonly beams: GroupShape;
}

/** Draws the tape. The order is the drawing's: beams set their chords' stems, and what goes around the notes clears what is drawn before it. */
export function drawTape(context: StaffContext, layout: NotationLayout, handLabels: Record<Hand, string>): TapeDrawing {
  const barLines = drawBarLines(context);
  const lines = [...barLines.lines, ...drawSignatureChanges(context), ...barLines.final, ...drawClefChanges(context)];

  // Beams first: they decide how long the stems of their chords are.
  const beams = group([], COLORS.note);
  for (const beam of layout.beams) beams.children.push(...drawBeam(context, beam));
  for (const tuplet of layout.tuplets) {
    if (tuplet.showNumber || tuplet.bracket) beams.children.push(...drawTuplet(context, tuplet));
  }

  const chords = context.ink.chords.map((_, index) => drawChord(context, index, handLabels));
  // A tie belongs to the chord it starts from, so it lights up with it; so do the chord's marks.
  for (const tie of layout.ties) chords[tie.from]?.children.push(drawTie(context, tie));
  for (const mark of layout.marks) chords[mark.chord]?.children.push(drawMark(context, mark));
  // A slur spans a phrase, so it stays in the ink colour with the beams.
  for (const phrase of layout.slurs) beams.children.push(drawSlur(context, phrase));

  // Grace notes and ornaments before what goes around the notes: bar numbers, brackets and
  // dynamics clear them too. Ornaments, tremolos and rolls belong to their chord and light up with it.
  const graces = layout.graces.map((grace) => drawGrace(context, grace));
  for (const ornament of layout.ornaments) chords[ornament.chord]?.children.push(...drawOrnament(context, ornament));
  for (const fingering of layout.fingerings) chords[fingering.chord]?.children.push(drawFingering(context, fingering));
  for (const tremolo of layout.tremolos) chords[tremolo.chord]?.children.push(...drawTremolo(context, tremolo));
  for (const arpeggio of layout.arpeggios) chords[arpeggio.chords[0] ?? -1]?.children.push(...drawArpeggio(context, arpeggio));

  const rests = group([], COLORS.note);
  for (const rest of layout.rests) rests.children.push(...drawRest(context, rest));
  // Bar numbers clear the notes, and volta brackets clear the bar numbers.
  const barNumbers = drawBarNumbers(context);
  rests.children.push(...barNumbers.shapes, ...drawNavigation(context, barNumbers.y));
  // Octave brackets first: the tempo marks go over the 8va ones, the pedal under the 8vb ones.
  const brackets: OctaveBracket[] = [];
  for (const shift of layout.octaveShifts) {
    const drawn = drawOctaveShift(context, shift);
    rests.children.push(...drawn.shapes);
    brackets.push(drawn.bracket);
  }
  // Dynamics before the pedal: those pushed under the lower staff, the pedal goes under.
  const dynamics = drawDynamics(context);
  rests.children.push(...drawPedal(context, { brackets, dynamics: dynamics.below }), ...dynamics.shapes);
  rests.children.push(...drawTempoMarks(context, brackets, barNumbers.y));

  return { lines, rests, chords, graces, beams };
}
