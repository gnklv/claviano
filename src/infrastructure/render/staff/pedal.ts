import { engravePedal } from '../../../domain/notation/pedalEngraving';
import type { StaffContext } from './context';
import { DYNAMICS_BELOW_LINE, type DynamicsBelow } from './dynamics';
import { BAR_LINE_GAP, LINES_PER_STAFF } from './geometry';
import { PEDAL_PRESS, PEDAL_RELEASE, PEDAL_SOSTENUTO, TEXT_FONT } from './glyphs';
import type { OctaveBracket } from './markings';
import { COLORS, inked, inkedPolyline, svg } from './svg';

/**
 * How far below the bottom line of the lower staff the pedal marks sit (their baseline), and how
 * far below low notes, stems and marks when those reach further down ("Ped." is 2 spaces tall).
 */
const PEDAL_DROP = 3.8;
const PEDAL_CLEARANCE = 2.6;
/** An articulation or fermata under a note reaches about this far below its reference line. */
const MARK_DEPTH = 1.5;
/** How far an octave glyph reaches below its baseline. */
const OCTAVE_BRACKET_DEPTH = 0.4;
/**
 * Width of the "Ped." glyph, where a line after it starts. The "✱" is centred this far before its
 * beat: a release on a bar line goes before the line (bar lines stand BAR_LINE_GAP before the beat).
 */
const PEDAL_PRESS_WIDTH = 4.1;
const PEDAL_SOSTENUTO_WIDTH = 4.4;
/** Where the middle pedal's line overlaps the right pedal's marks, it goes this much lower. */
const PEDAL_ROW = 2.4;
const PEDAL_RELEASE_BEFORE = 2.2;
/** Bracket hooks and change notches: height, and half the width of a notch. */
const PEDAL_HOOK = 1.2;
const PEDAL_NOTCH = 0.5;
/** A line ends this far before its release beat: before the bar line (even the final double one) when released on one. */
const PEDAL_LINE_GAP = 2.4;
/** "una corda" / "tre corde": this far under the upper staff, above the dynamics. */
const SOFT_PEDAL_DROP = 1.8;
const SOFT_PEDAL_INSET = 0.8;

/** What is already drawn under the lower staff, for the pedal marks to go under it. */
interface UnderLowerStaff {
  brackets: readonly OctaveBracket[];
  dynamics: readonly DynamicsBelow[];
}

/**
 * The pedals. Under the lower staff, the right one ("Ped." and "✱" signs, bracket lines) and the
 * middle one ("Sost." and a line); each sits clear of the low notes, stems and marks above it, and
 * a line keeps one height all along. The left one in words between the staves.
 */
export function drawPedal(context: StaffContext, under: UnderLowerStaff): SVGElement[] {
  const { score, geometry } = context;
  const { space } = geometry;
  const { signs, lines, words } = engravePedal(score);
  const shapes: SVGElement[] = [];
  const baseline = (left: number, right: number) =>
    Math.max(geometry.systemBottom() + PEDAL_DROP * space, bassFloor(context, under, left, right) + PEDAL_CLEARANCE * space);

  // "Ped." / "Sost." start a little before their beat, under the left edge of the note they go with.
  const pressLeft = (beat: number) => geometry.at(beat) - 0.5 * space;
  const signWidth = (pedal: 'sustain' | 'sostenuto') => (pedal === 'sustain' ? PEDAL_PRESS_WIDTH : PEDAL_SOSTENUTO_WIDTH) * space;
  // A sign followed by a line sits at the line's height.
  const lineBaselines = new Map<string, number>();
  // Where the right pedal's marks are, so the middle pedal's line can keep out of their way.
  const sustainSpans: [number, number][] = signs
    .filter((sign) => sign.kind !== 'sostenuto')
    .map((sign) => [pressLeft(sign.beat) - 2 * space, pressLeft(sign.beat) + PEDAL_PRESS_WIDTH * space]);

  const hook = PEDAL_HOOK * space;
  const notch = PEDAL_NOTCH * space;
  for (const line of lines) {
    // ⌊ (or "Ped." and then the line), ∧ at each change, and ⌋ just before the release.
    const left = pressLeft(line.from);
    const from = left + (line.afterSign ? signWidth(line.pedal) + 0.3 * space : 0);
    // Measured from the bar line when the release is on one (the next bar may have room after it).
    const to = Math.max(from + space, geometry.edgeAt(line.to) - (PEDAL_LINE_GAP - BAR_LINE_GAP) * space);
    let y = baseline(left, to);
    if (line.pedal === 'sustain') sustainSpans.push([left, to]);
    else if (sustainSpans.some(([a, b]) => a < to && b > left)) y += PEDAL_ROW * space;
    if (line.afterSign) lineBaselines.set(`${line.pedal} ${line.from}`, y);
    const points = line.afterSign ? [`${from},${y}`] : [`${from},${y - hook}`, `${from},${y}`];
    for (const change of line.changes) {
      const at = geometry.at(change);
      if (at - notch <= from || at + notch >= to) continue;
      points.push(`${at - notch},${y}`, `${at},${y - hook}`, `${at + notch},${y}`);
    }
    points.push(`${to},${y}`, `${to},${y - hook}`);
    shapes.push(inkedPolyline({ points: points.join(' '), fill: 'none', 'stroke-width': space * 0.12 }));
  }

  for (const sign of signs) {
    const release = sign.kind === 'release';
    const pedal = sign.kind === 'sostenuto' ? 'sostenuto' : 'sustain';
    const releaseX = geometry.edgeAt(sign.beat) - (PEDAL_RELEASE_BEFORE - BAR_LINE_GAP) * space;
    const left = release ? releaseX - 0.9 * space : pressLeft(sign.beat);
    const y =
      (!release && lineBaselines.get(`${pedal} ${sign.beat}`)) || baseline(left, left + (release ? 1.8 * space : signWidth(pedal)));
    const codepoint = release ? PEDAL_RELEASE : pedal === 'sostenuto' ? PEDAL_SOSTENUTO : PEDAL_PRESS;
    const glyph = inked(space, codepoint, release ? releaseX : left, y);
    if (release) glyph.setAttribute('text-anchor', 'middle');
    shapes.push(glyph);
  }

  // The left pedal's words, in italics between the staves, like other playing directions.
  // Just under the upper staff, above the dynamics line.
  const wordsY = geometry.trebleTop() + (LINES_PER_STAFF - 1 + SOFT_PEDAL_DROP) * space;
  for (const { beat, text } of words) {
    const element = svg('text', {
      // Just past the notehead, clear of a stem hanging down from its left side.
      x: geometry.at(beat) + SOFT_PEDAL_INSET * space,
      y: wordsY,
      'font-size': space * 1.3,
      'font-family': TEXT_FONT,
      'font-style': 'italic',
    });
    element.textContent = text;
    element.style.setProperty('fill', COLORS.note);
    shapes.push(element);
  }
  return shapes;
}

/** The lowest point (largest y) of the lower staff's notes, down stems, marks, 8vb brackets and dynamics under it between two x's. */
function bassFloor({ geometry, ink }: StaffContext, under: UnderLowerStaff, left: number, right: number): number {
  const { space } = geometry;
  let floor = geometry.systemBottom();
  for (const index of ink.within('bass', left, right)) {
    const chord = ink.chords[index];
    const g = ink.of(chord);
    floor = Math.max(floor, g.lowest + space / 2);
    if (!chord.stemUp && chord.duration.value !== 'whole') floor = Math.max(floor, ink.stemEnd(index));
    for (const mark of ink.marksOf.get(index) ?? []) {
      if (!mark.above) floor = Math.max(floor, g.yOf(mark.step) + MARK_DEPTH * space);
    }
  }
  // An 8vb bracket under the staff (its glyph sits on the baseline, the hook reaches up).
  for (const bracket of under.brackets) {
    if (bracket.staff !== 'bass' || bracket.above || bracket.right < left || bracket.left > right) continue;
    floor = Math.max(floor, bracket.y + OCTAVE_BRACKET_DEPTH * space);
  }
  // Dynamics pushed under the staff.
  for (const mark of under.dynamics) {
    if (mark.right < left || mark.left > right) continue;
    floor = Math.max(floor, mark.y + DYNAMICS_BELOW_LINE * space);
  }
  return floor;
}
