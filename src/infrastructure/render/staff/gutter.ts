import type { KeySignature, TimeSignature } from '../../../domain/score';
import { keySignatureSteps } from '../../../domain/notation/signatures';
import type { Clef } from '../staffLayout';
import { CLEF_AREA, FLAT_ADVANCE, LINES_PER_STAFF, SHARP_ADVANCE, keySignatureWidth, timeSignatureWidth, type StaffGeometry } from './geometry';
import { CLEF_GLYPH, CLEF_LINE_STEP, FLAT, MUSIC_FONT, SHARP, timeDigits } from './glyphs';
import { COLORS, svg } from './svg';

/** What the left column shows: the clefs in force (upper, lower) and, with music, the signatures. */
export interface GutterContent {
  clefs: [Clef, Clef];
  signatures: { key: KeySignature; time: TimeSignature } | null;
}

/**
 * What never moves: the staff lines across the whole view, the line joining both staves, and the
 * left column with the clefs, the key signature and the time signature in force under the cursor.
 */
export function drawGutter(geometry: StaffGeometry, { clefs, signatures }: GutterContent): SVGElement[] {
  const { space } = geometry;
  const shapes: SVGElement[] = [];
  const glyph = (codepoint: string, x: number, y: number, anchor: 'start' | 'middle' = 'start') => {
    const text = svg('text', { x, y, fill: COLORS.clef, 'font-size': space * 4, 'font-family': MUSIC_FONT, 'text-anchor': anchor });
    text.textContent = codepoint;
    return text;
  };

  for (const top of [geometry.trebleTop(), geometry.bassTop()]) {
    for (let line = 0; line < LINES_PER_STAFF; line++) {
      const y = top + line * space;
      shapes.push(svg('line', { x1: space * 0.5, x2: geometry.width, y1: y, y2: y, stroke: COLORS.staffLine, 'stroke-width': 1 }));
    }
  }

  // The line joining both staves at the start of the system.
  shapes.push(
    svg('line', {
      x1: space * 0.5,
      x2: space * 0.5,
      y1: geometry.trebleTop(),
      y2: geometry.systemBottom(),
      stroke: COLORS.barLine,
      'stroke-width': 1.5,
    }),
  );

  // The clefs in force under the cursor; usually treble above and bass below.
  const [upper, lower] = clefs;
  shapes.push(
    glyph(CLEF_GLYPH[upper], space * 1.2, geometry.trebleTop() + (CLEF_LINE_STEP[upper] * space) / 2),
    glyph(CLEF_GLYPH[lower], space * 1.2, geometry.bassTop() + (CLEF_LINE_STEP[lower] * space) / 2),
  );

  if (!signatures) return shapes;
  const { key, time } = signatures;
  const staves: [Clef, number][] = [
    [upper, geometry.trebleTop()],
    [lower, geometry.bassTop()],
  ];

  // Each accidental sits on its line or space: a step is half a staff space.
  const keyX = CLEF_AREA * space;
  const advance = (key.fifths >= 0 ? SHARP_ADVANCE : FLAT_ADVANCE) * space;
  for (const [clef, top] of staves) {
    keySignatureSteps(key.fifths, clef).forEach((step, index) => {
      shapes.push(glyph(key.fifths > 0 ? SHARP : FLAT, keyX + index * advance, top + (step * space) / 2));
    });
  }

  // Time signature digits are two spaces tall and centred on their baseline:
  // the numerator fills the upper half of the staff, the denominator the lower half.
  const timeCenter = keyX + keySignatureWidth(key) * space + (timeSignatureWidth(time) * space) / 2;
  for (const [, top] of staves) {
    shapes.push(glyph(timeDigits(time.numerator), timeCenter, top + space, 'middle'), glyph(timeDigits(time.denominator), timeCenter, top + 3 * space, 'middle'));
  }
  return shapes;
}
