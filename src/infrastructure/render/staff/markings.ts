import { barAtBeat, clefAt, writtenBarNumber, writtenBarStart } from '../../../domain/score';
import type { StaffOctaveShift } from '../../../domain/notation/engraving';
import { cancelledSteps, keySignatureSteps } from '../../../domain/notation/signatures';
import { beatPosition, tapeBars, type Clef } from '../staffLayout';
import type { StaffContext } from './context';
import {
  CHANGE_GAP_BEFORE,
  FLAT_ADVANCE,
  LINES_PER_STAFF,
  NATURAL_ADVANCE,
  REPEAT_GLYPH_WIDTH,
  SHARP_ADVANCE,
  SIGNATURE_GAP,
  keySignatureWidth,
  timeSignatureWidth,
} from './geometry';
import {
  CLEF_CHANGE_GLYPH,
  CLEF_CHANGE_SCALE,
  CLEF_LINE_STEP,
  CODA,
  FLAT,
  LABEL_FONT,
  METRONOME_DOT,
  METRONOME_NOTE,
  MUSIC_FONT,
  NATURAL,
  OCTAVE_GLYPH_ABOVE,
  OCTAVE_GLYPH_BELOW,
  octaveClefGlyph,
  REPEAT_LEFT,
  REPEAT_RIGHT,
  SEGNO,
  SHARP,
  TEXT_FONT,
  timeDigits,
} from './glyphs';
import { COLORS, inked, inkedPolyline, svg } from './svg';

/**
 * Bar numbers: this far right of the bar line and over the top line, clear of notes by this much;
 * and how wide two digits are, in staff spaces.
 */
const BAR_NUMBER_INSET = 0.4;
const BAR_NUMBER_RISE = 1.2;
const BAR_NUMBER_CLEARANCE = 0.6;
const BAR_NUMBER_WIDTH = 1.6;
/** A volta bracket's line stays this far above a bar number's baseline (its label hangs below the line). */
const VOLTA_OVER_NUMBER = 2.6;

/**
 * Metronome marks: a small note (SMuFL metronome glyphs) and "= 90", this far over the top line of
 * the treble staff.
 */
const TEMPO_MARK_RISE = 3.4;
const TEMPO_NOTE_SIZE = 2.6;
const TEMPO_NOTE_WIDTH = 1.3;
const TEMPO_DOT_WIDTH = 0.3;
/** A metronome mark over an 8va bracket goes this far above the bracket's baseline. */
const TEMPO_OVER_OCTAVE = 3.2;

/**
 * Octave shift brackets: "8va" (15ma, 22ma) and a dashed line over the notes it covers, with a
 * hook at the end towards the staff; "8vb" (15mb, 22mb) the same under them.
 * Widths of the glyphs at the music font size, in staff spaces (the line starts after them).
 */
const OCTAVE_GLYPH_WIDTH_ABOVE = 3.6;
const OCTAVE_GLYPH_WIDTH_BELOW = 3.2;
/** Clearance from the staff and from the notes, and the height of the dashed line above the baseline. */
const OCTAVE_CLEARANCE = 2.2;
const OCTAVE_LINE_RISE = 0.8;
const OCTAVE_HOOK = 1.0;

/** Where an octave bracket was drawn (its baseline), for what goes over or under it to clear it. */
export interface OctaveBracket {
  staff: Clef;
  above: boolean;
  left: number;
  right: number;
  y: number;
}

/** Bar lines through both staves, and the final bar line: a thin and a thick one. */
export function drawBarLines({ score, geometry }: StaffContext): { lines: SVGElement[]; final: SVGElement[] } {
  const { space } = geometry;
  const top = geometry.trebleTop();
  const bottom = geometry.systemBottom();
  const line = (x: number, width: number) => svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': width });
  const end = geometry.barLineX(tapeBars(score).starts.length);
  return {
    lines: score.notation.bars.map((_, index) => line(geometry.barLineX(index), 1)),
    final: [line(end - space * 0.6, 1), line(end, space * 0.4)],
  };
}

/** Clef changes in the middle of the music: a small clef just before the first note it applies to. */
export function drawClefChanges({ score, geometry }: StaffContext): SVGElement[] {
  const { space } = geometry;
  const shapes: SVGElement[] = [];
  for (const change of score.notation.clefs) {
    if (change.beat <= 1e-9) continue; // the opening clefs live in the left column
    const bar = barAtBeat(score, change.beat);
    const staffTop = change.staff === 1 ? geometry.trebleTop() : geometry.bassTop();
    const octaveClef = octaveClefGlyph({ clef: change.clef, octaves: change.octaves ?? 0 });
    const text = svg('text', {
      x: geometry.px(beatPosition(score, bar, change.beat)) - 2.6 * space,
      y: staffTop + (CLEF_LINE_STEP[change.clef] * space) / 2,
      fill: COLORS.clef,
      // A clef with an 8 has no small glyph of its own: the full one, drawn smaller.
      'font-size': space * 4 * (octaveClef ? CLEF_CHANGE_SCALE : 1),
      'font-family': MUSIC_FONT,
    });
    text.textContent = octaveClef ?? CLEF_CHANGE_GLYPH[change.clef];
    shapes.push(text);
  }
  return shapes;
}

/**
 * Key and time changes where they happen, as printed: a double bar line before a new key, naturals
 * cancelling what the old key had, the new key signature, the new time signature.
 */
export function drawSignatureChanges({ score, geometry }: StaffContext): SVGElement[] {
  const { space } = geometry;
  const shapes: SVGElement[] = [];
  const top = geometry.trebleTop();
  const bottom = geometry.systemBottom();
  for (const change of geometry.changes) {
    const line = geometry.barLineX(change.bar);
    const beat = writtenBarStart(score, change.bar);
    // A ‖: draws its own thick line; otherwise a new key gets a double bar line.
    if (change.key && !score.notation.bars[change.bar]?.navigation.repeatStart) {
      const x = line - 0.5 * space;
      shapes.push(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
    }
    const staves: [Clef, number][] = [
      [clefAt(score, 1, beat), top],
      [clefAt(score, 2, beat), geometry.bassTop()],
    ];
    let x = line + (score.notation.bars[change.bar]?.navigation.repeatStart ? REPEAT_GLYPH_WIDTH * space : 0) + CHANGE_GAP_BEFORE * space;
    if (change.key) {
      const { from, to } = change.key;
      const naturals = cancelledSteps(from, to, 'treble').length;
      for (const [clef, staffTop] of staves) {
        cancelledSteps(from, to, clef).forEach((step, i) => {
          shapes.push(inked(space, NATURAL, x + i * NATURAL_ADVANCE * space, staffTop + (step * space) / 2));
        });
      }
      x += naturals * NATURAL_ADVANCE * space + (naturals > 0 ? SIGNATURE_GAP * space : 0);
      const advance = (to >= 0 ? SHARP_ADVANCE : FLAT_ADVANCE) * space;
      for (const [clef, staffTop] of staves) {
        keySignatureSteps(to, clef).forEach((step, i) => {
          shapes.push(inked(space, to > 0 ? SHARP : FLAT, x + i * advance, staffTop + (step * space) / 2));
        });
      }
      x += keySignatureWidth({ fifths: to }) * space;
    }
    if (change.time) {
      const center = x + (timeSignatureWidth(change.time) * space) / 2;
      for (const [, staffTop] of staves) {
        const numerator = inked(space, timeDigits(change.time.numerator), center, staffTop + space);
        const denominator = inked(space, timeDigits(change.time.denominator), center, staffTop + 3 * space);
        numerator.setAttribute('text-anchor', 'middle');
        denominator.setAttribute('text-anchor', 'middle');
        shapes.push(numerator, denominator);
      }
    }
  }
  return shapes;
}

/**
 * Bar numbers over the treble staff, just after each bar line; raised over a high note or stem
 * at the start of the bar, so they never sit on it. Also gives where each one was drawn (its baseline).
 */
export function drawBarNumbers({ score, geometry, ink }: StaffContext): { shapes: SVGElement[]; y: number[] } {
  const { space } = geometry;
  const top = geometry.trebleTop();
  const y: number[] = [];
  const shapes = score.notation.bars.map((_, index) => {
    const x = geometry.barLineX(index) + BAR_NUMBER_INSET * space;
    const reach = ink.extent('treble', x, x + BAR_NUMBER_WIDTH * space);
    const numberY = Math.min(top - BAR_NUMBER_RISE * space, reach.top - BAR_NUMBER_CLEARANCE * space);
    y.push(numberY);
    const number = svg('text', {
      x,
      y: numberY,
      fill: COLORS.barNumber,
      'font-size': space * 1.1,
      'font-family': LABEL_FONT,
    });
    number.textContent = String(writtenBarNumber(score, index));
    return number;
  });
  return { shapes, y };
}

/**
 * Repeat signs at bar lines, volta brackets over the treble staff (and over the bar numbers, at
 * `barNumberY`), segno and coda signs, and the words of jumps ("D.C. al Fine", "To Coda") over the
 * ends of their bars.
 */
export function drawNavigation({ score, geometry }: StaffContext, barNumberY: readonly number[]): SVGElement[] {
  const { space } = geometry;
  const navigation = score.notation.bars.map((bar) => bar.navigation);
  const shapes: SVGElement[] = [];
  const staves = [geometry.trebleTop(), geometry.bassTop()];
  const barStart = (i: number) => geometry.barLineX(i);
  const barEnd = (i: number) => geometry.barLineX(i + 1);
  const top = geometry.trebleTop();
  const ink = (element: SVGElement) => {
    element.style.setProperty('fill', COLORS.note);
    return element;
  };
  const glyph = (codepoint: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'start') => {
    const text = inked(space, codepoint, x, y);
    text.setAttribute('text-anchor', anchor);
    return text;
  };

  navigation.forEach((nav, i) => {
    // The repeat glyphs include their thick and thin lines and dots, one staff tall.
    for (const staffTop of staves) {
      if (nav.repeatStart) shapes.push(glyph(REPEAT_LEFT, barStart(i), staffTop + 4 * space));
      if (nav.repeatEnd) shapes.push(glyph(REPEAT_RIGHT, barEnd(i), staffTop + 4 * space, 'end'));
    }
    if (nav.segnoSign) shapes.push(glyph(SEGNO, barStart(i) + space, top - 2.6 * space));
    if (nav.codaSign) shapes.push(glyph(CODA, barStart(i) + space, top - 2.6 * space));
    if (nav.text) {
      const words = svg('text', {
        x: barEnd(i) - space * 0.5,
        y: top - 3.4 * space,
        'font-size': space * 1.3,
        'font-family': TEXT_FONT,
        'font-style': 'italic',
        'font-weight': 'bold',
        'text-anchor': 'end',
      });
      words.textContent = nav.text;
      shapes.push(ink(words));
    }

    // A volta: a bracket from the first bar of its ending to the last, with its label.
    if (nav.endingLabel) {
      let last = i;
      while (navigation[last + 1]?.ending && !navigation[last + 1]?.endingLabel) last++;
      // Over the bar numbers under it (they may have risen over high notes).
      const numbers = barNumberY.slice(i, last + 1);
      const y = Math.min(top - 4.6 * space, ...numbers.map((numberY) => numberY - VOLTA_OVER_NUMBER * space));
      const hook = 1.6 * space;
      const left = barStart(i) + 0.3 * space;
      const right = barEnd(last) - 0.3 * space;
      const closed = navigation[last]?.endingClosed;
      const line = inkedPolyline({
        points: `${left},${y + hook} ${left},${y} ${right},${y}${closed ? ` ${right},${y + hook}` : ''}`,
        fill: 'none',
        'stroke-width': space * 0.12,
      });
      const label = svg('text', {
        x: left + 0.5 * space,
        y: y + 1.4 * space,
        'font-size': space * 1.3,
        'font-family': LABEL_FONT,
        'font-weight': 'bold',
      });
      label.textContent = nav.endingLabel;
      shapes.push(line, ink(label));
    }
  });
  return shapes;
}

/**
 * An octave shift bracket: "8va" and a dashed line clear of the notes under it, ending with a
 * hook towards the staff just before the notes go back to their own octave.
 */
export function drawOctaveShift({ geometry, ink }: StaffContext, shift: StaffOctaveShift): { shapes: SVGElement[]; bracket: OctaveBracket } {
  const { space } = geometry;
  const above = shift.octaves > 0;
  const glyphs = above ? OCTAVE_GLYPH_ABOVE : OCTAVE_GLYPH_BELOW;
  const glyph = glyphs[Math.min(glyphs.length, Math.abs(shift.octaves)) - 1] ?? '';
  const glyphWidth = (above ? OCTAVE_GLYPH_WIDTH_ABOVE : OCTAVE_GLYPH_WIDTH_BELOW) * space;
  const left = geometry.at(shift.start) - 0.5 * space;
  const right = Math.max(left + glyphWidth + space, geometry.edgeAt(shift.end));
  const staffTop = geometry.staffTop(shift.staff);
  const staffBottom = staffTop + (LINES_PER_STAFF - 1) * space;
  const reach = ink.extent(shift.staff, left, right);
  const y = above
    ? Math.min(staffTop, reach.top) - OCTAVE_CLEARANCE * space + OCTAVE_LINE_RISE * space
    : Math.max(staffBottom, reach.bottom) + OCTAVE_CLEARANCE * space + OCTAVE_LINE_RISE * space;
  const lineY = y - OCTAVE_LINE_RISE * space;
  const hook = (above ? 1 : -1) * OCTAVE_HOOK * space;
  const lineStart = left + glyphWidth + 0.3 * space;
  const line = inkedPolyline({
    points: `${lineStart},${lineY} ${right},${lineY} ${right},${lineY + hook}`,
    fill: 'none',
    'stroke-width': space * 0.12,
    'stroke-dasharray': `${space * 0.6} ${space * 0.4}`,
  });
  return { shapes: [inked(space, glyph, left, y), line], bracket: { staff: shift.staff, above, left, right, y } };
}

/** Metronome marks over the treble staff where the tempo is set: "♩ = 90", "♩. = 60"; over 8va brackets. */
export function drawTempoMarks({ score, geometry }: StaffContext, brackets: readonly OctaveBracket[]): SVGElement[] {
  const { space } = geometry;
  const shapes: SVGElement[] = [];
  for (const mark of score.notation.tempoMarks) {
    const x = geometry.px(beatPosition(score, barAtBeat(score, mark.beat), mark.beat)) - 0.5 * space;
    // Over an 8va bracket if there is one here.
    const bracket = brackets.find((b) => b.staff === 'treble' && b.above && x < b.right && x + 5 * space > b.left);
    const y = Math.min(geometry.trebleTop() - TEMPO_MARK_RISE * space, bracket ? bracket.y - TEMPO_OVER_OCTAVE * space : Infinity);
    const note = svg('text', { x, y, 'font-size': space * TEMPO_NOTE_SIZE, 'font-family': MUSIC_FONT });
    note.textContent = METRONOME_NOTE[mark.unit.value] + (mark.unit.dots ? METRONOME_DOT : '');
    const words = svg('text', {
      x: x + (TEMPO_NOTE_WIDTH + (mark.unit.dots ? TEMPO_DOT_WIDTH : 0)) * space,
      y,
      'font-size': space * 1.3,
      'font-family': TEXT_FONT,
      'font-weight': 'bold',
    });
    words.textContent = `= ${mark.perMinute}`;
    for (const element of [note, words]) element.style.setProperty('fill', COLORS.note);
    shapes.push(note, words);
  }
  return shapes;
}
