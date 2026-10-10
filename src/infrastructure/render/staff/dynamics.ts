import { barAtBeat } from '../../../domain/score';
import { beatPosition } from '../staffLayout';
import type { StaffContext } from './context';
import { LINES_PER_STAFF } from './geometry';
import { DYNAMIC_LETTERS, TEXT_FONT } from './glyphs';
import { COLORS, inked, inkedPolyline, svg } from './svg';

/*
 * Dynamics: marks (SMuFL letters p, m, f, r, s, z, n combined), words (cresc., dim.) and hairpins,
 * between the staves (or under the lower one); their baseline sits DYNAMICS_DROP below the upper
 * staff, lower where notes of the upper staff reach down, by DYNAMICS_CLEARANCE.
 */
const DYNAMICS_DROP = 4;
const DYNAMICS_CLEARANCE = 2;
/** How far a mark (or a hairpin's lower line) reaches below its baseline, plus a little air. */
export const DYNAMICS_BELOW_LINE = 0.6;
/** Width of one dynamic letter, roughly (spaces): a hairpin starting at a mark begins after it. */
const DYNAMIC_LETTER_WIDTH = 1.3;
/** Half the opening of a hairpin, and how far above the dynamics baseline its middle is. */
const HAIRPIN_OPENING = 0.6;
const HAIRPIN_RISE = 0.7;

/** Dynamics drawn under the lower staff: where, and their baseline. */
export interface DynamicsBelow {
  left: number;
  right: number;
  y: number;
}

/**
 * Dynamics as printed: marks in the music font, words in italics, hairpins as two lines
 * opening (crescendo) or closing (diminuendo). Between the staves, clear of the upper staff's
 * low notes; or under the lower staff when the file puts them there. Also gives those under the
 * lower staff, for the pedal marks to go under them.
 */
export function drawDynamics({ score, geometry, ink }: StaffContext): { shapes: SVGElement[]; below: DynamicsBelow[] } {
  const { space } = geometry;
  const shapes: SVGElement[] = [];
  const below: DynamicsBelow[] = [];
  const x = (beat: number) => geometry.px(beatPosition(score, barAtBeat(score, beat), beat));
  // Between the staves if the notes of both leave room there (a mark is about two spaces
  // tall), otherwise under the lower staff, as the file asks for some marks anyway.
  const baseline = (under: boolean, left: number, right: number) => {
    const bass = ink.extent('bass', left, right);
    const lower = () => {
      const y = Math.max(geometry.systemBottom(), bass.bottom) + DYNAMICS_CLEARANCE * space;
      below.push({ left, right, y });
      return y;
    };
    if (under) return lower();
    const upperBottom = geometry.trebleTop() + (LINES_PER_STAFF - 1) * space;
    const treble = ink.extent('treble', left, right);
    const y = Math.max(upperBottom + DYNAMICS_DROP * space, treble.bottom + DYNAMICS_CLEARANCE * space);
    const room = Math.min(geometry.bassTop(), bass.top) - DYNAMICS_BELOW_LINE * space;
    return y <= room ? y : lower();
  };

  for (const mark of score.notation.dynamics) {
    const at = x(mark.beat);
    if (mark.letters) {
      const width = mark.text.length * DYNAMIC_LETTER_WIDTH * space;
      const letters = [...mark.text].map((letter) => DYNAMIC_LETTERS[letter] ?? '').join('');
      const glyph = inked(space, letters, at, baseline(mark.below, at - width / 2, at + width / 2));
      glyph.setAttribute('text-anchor', 'middle');
      shapes.push(glyph);
    } else {
      const words = svg('text', {
        x: at - 0.5 * space,
        y: baseline(mark.below, at, at + 4 * space),
        'font-size': space * 1.3,
        'font-family': TEXT_FONT,
        'font-style': 'italic',
      });
      words.textContent = mark.text;
      words.style.setProperty('fill', COLORS.note);
      shapes.push(words);
    }
  }

  // Words under the upper staff ("sempre pianissimo"): on the dynamics' line, after a mark standing at the same place.
  for (const mark of score.notation.words) {
    if (!mark.below) continue;
    const beside = score.notation.dynamics.find((dynamic) => Math.abs(dynamic.beat - mark.beat) < 1e-6);
    const left = x(mark.beat) + (beside ? (beside.text.length * (beside.letters ? DYNAMIC_LETTER_WIDTH : 0.6) + 1) * space : -0.5 * space);
    const words = svg('text', {
      x: left,
      y: baseline(false, left, left + mark.text.length * 0.6 * space),
      'font-size': space * 1.3,
      'font-family': TEXT_FONT,
      'font-style': 'italic',
    });
    words.textContent = mark.text;
    words.style.setProperty('fill', COLORS.note);
    shapes.push(words);
  }

  for (const hairpin of score.notation.hairpins) {
    // Clear of a mark at either end: start after it, end before it.
    const markAt = (beat: number) => score.notation.dynamics.find((m) => m.letters && Math.abs(m.beat - beat) < 1e-6);
    const startMark = markAt(hairpin.start);
    const endMark = markAt(hairpin.end);
    const from = x(hairpin.start) + (startMark ? (startMark.text.length * DYNAMIC_LETTER_WIDTH) / 2 + 0.4 : -0.5) * space;
    const endX = geometry.edgeX(beatPosition(score, barAtBeat(score, hairpin.end), hairpin.end));
    const to = Math.max(from + 2 * space, endX - (endMark ? (endMark.text.length * DYNAMIC_LETTER_WIDTH) / 2 + 0.4 : 0.8) * space);
    const middle = baseline(hairpin.below, from, to) - HAIRPIN_RISE * space;
    const open = HAIRPIN_OPENING * space;
    const [narrow, wide] = hairpin.type === 'crescendo' ? [from, to] : [to, from];
    shapes.push(
      inkedPolyline({
        points: `${wide},${middle - open} ${narrow},${middle} ${wide},${middle + open}`,
        fill: 'none',
        'stroke-width': space * 0.12,
      }),
    );
  }
  return { shapes, below };
}
