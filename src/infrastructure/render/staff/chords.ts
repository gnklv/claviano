import type { Hand } from '../../../domain/note';
import { flagCount } from '../../../domain/notation/noteValue';
import { avoidNotes, beamLine, beamY, kneeBeamLine, type BeamObstacle } from '../beams';
import { arc, slur } from '../curves';
import type { Beam, StaffMark, StaffRest, StaffSlur, Tie, Tuplet } from '../../../domain/notation/engraving';
import type { StaffContext } from './context';
import {
  ACCIDENTAL_GLYPH,
  AUGMENTATION_DOT,
  FLAG_DOWN,
  FLAG_UP,
  MARK_GLYPHS,
  MUSIC_FONT,
  NOTEHEAD,
  REST,
  REST_WIDTH,
  TEXT_FONT,
  tupletDigits,
} from './glyphs';
import { STEM_LENGTH, STEM_LENGTH_32ND, type ChordGeometry } from './ink';
import { COLORS, noteGlyph, svg } from './svg';

const LEDGER_EXTENSION = 0.4;
const ACCIDENTAL_OFFSET = 1.3;
const DOT_OFFSET = 0.35;
/** Beams: thickness, distance between stacked beams, stub length for a lone shorter note. */
const BEAM_THICKNESS = 0.5;
const BEAM_SPACING = 0.75;
const BEAM_STUB = 1.2;
/** A beam tilts at most this much from end to end, and every stem keeps at least MIN_BEAMED_STEM. */
const BEAM_MAX_RISE = 1;
const MIN_BEAMED_STEM = 2.5;
/**
 * A beam keeps this far from another voice's notes, and may shorten its stems down to
 * SHORTEST_BEAMED_STEM to do so before it moves past them instead.
 */
const BEAM_CLEARANCE = 0.4;
const SHORTEST_BEAMED_STEM = 2;
/** Stems of a beam across both staves may be this short: the gap between the staves is narrow. */
const SHORTEST_KNEED_STEM = 1.2;
/** Slur ends sit this far beyond a notehead or a stem end. */
const SLUR_HEAD_GAP = 1.2;
const SLUR_STEM_GAP = 0.6;
/** Ties start and end this far clear of the noteheads, and this far off the note's centre. */
const TIE_GAP = 0.15;
const TIE_OFFSET = 0.6;

/**
 * One chord as a group whose parts all paint with `currentColor`, so highlighting it
 * is a single style change on the group. A beamed chord gets its stem end from the beam
 * and no flags.
 */
export function drawChord({ geometry, ink }: StaffContext, index: number, handLabels: Record<Hand, string>): SVGGElement {
  const { space } = geometry;
  const chord = ink.chords[index];
  const beamEnd = ink.stemEnds.get(index);
  const { value, dots } = chord.duration;
  const { yOf, headWidth, left, stemWidth, stemX, highest, lowest } = ink.of(chord);
  const glyph = (codepoint: string, x: number, y: number) => noteGlyph(space, codepoint, x, y);

  const group = svg('g');
  group.style.color = COLORS.note;

  // A head moved over for a second sits a head's width away, sharing the stem's edge
  // (to the right of an up-stem, to the left of a down-stem).
  const shift = (headWidth - (value === 'whole' ? 0 : stemWidth)) * (chord.stemUp ? 1 : -1);
  const displaced = chord.notes.some((note) => note.displaced);
  const headsLeft = displaced && shift < 0 ? left + shift : left;
  const headsRight = (displaced && shift > 0 ? left + shift : left) + headWidth;

  for (const step of chord.ledgerSteps) {
    const y = yOf(step);
    const extension = LEDGER_EXTENSION * space;
    group.append(
      svg('line', {
        x1: headsLeft - extension,
        x2: headsRight + extension,
        y1: y,
        y2: y,
        stroke: 'currentColor',
        'stroke-width': space * 0.16,
      }),
    );
  }

  for (const note of chord.notes) {
    const y = yOf(note.step);
    group.append(glyph(NOTEHEAD[value], note.displaced ? left + shift : left, y));
    // Accidentals keep clear of every head (a voice moved aside for a second keeps them left of the
    // other voice's head too); dots follow the rightmost head.
    if (note.accidental) {
      const clearOf = headsLeft - (chord.voiceShift ? headWidth : 0);
      group.append(glyph(ACCIDENTAL_GLYPH[note.accidental], clearOf - ACCIDENTAL_OFFSET * space, y));
    }
    // A dot goes in a space: for a note on a line, in the space just above.
    if (dots) {
      const dotStep = note.step % 2 === 0 ? note.step - 1 : note.step;
      group.append(glyph(AUGMENTATION_DOT, headsRight + DOT_OFFSET * space, yOf(dotStep)));
    }
  }

  // "L.H." between the staves under a left-hand note on the treble staff, "R.H." above a
  // right-hand note on the bass staff.
  if (chord.handMark) {
    const y = chord.staff === 'treble' ? geometry.trebleTop() + 6.4 * space : geometry.bassTop() - 1.4 * space;
    const mark = svg('text', {
      x: left + headWidth / 2,
      y,
      fill: 'currentColor',
      'font-size': space * 1.3,
      'font-family': TEXT_FONT,
      'font-style': 'italic',
      'text-anchor': 'middle',
    });
    mark.textContent = handLabels[chord.hand];
    group.append(mark);
  }

  if (value !== 'whole') {
    const flags = flagCount(value);
    const length = (flags === 3 ? STEM_LENGTH_32ND : STEM_LENGTH) * space;
    // Up: from the lowest head past the highest one. Down: the mirror image.
    const from = chord.stemUp ? lowest - space * 0.17 : highest + space * 0.17;
    const to = beamEnd ?? (chord.stemUp ? highest - length : lowest + length);
    group.append(svg('line', { x1: stemX, x2: stemX, y1: from, y2: to, stroke: 'currentColor', 'stroke-width': stemWidth }));
    if (flags > 0 && beamEnd === undefined) {
      group.append(glyph((chord.stemUp ? FLAG_UP : FLAG_DOWN)[flags], stemX - stemWidth / 2, to));
    }
  }
  return group;
}

/**
 * A beam and its extra levels (a second beam for sixteenths, a third for thirty-seconds).
 * Records where each of its chords' stems must end.
 */
export function drawBeam(context: StaffContext, beam: Beam): SVGPolygonElement[] {
  const { ink } = context;
  const { space } = context.geometry;
  const chords = beam.chords.map((index) => ink.chords[index]);
  const geometry = chords.map((chord) => ink.of(chord));
  const levels = Math.max(...chords.map((chord) => flagCount(chord.duration.value)));
  const minStem = (MIN_BEAMED_STEM + (levels - 1) * BEAM_SPACING) * space;
  // A group across both staves with stems both ways: a beam between the staves.
  const kneed = new Set(chords.map((chord) => chord.staff)).size > 1 && chords.some((chord) => chord.stemUp !== beam.stemUp);
  const plain = kneed
    ? kneeBeamLine(
        chords.map((chord, i) => {
          const g = geometry[i];
          return { x: g.stemX, noteY: chord.stemUp ? g.highest : g.lowest, stemUp: chord.stemUp };
        }),
        SHORTEST_KNEED_STEM * space,
      )
    : beamLine(
        geometry.map((g) => ({ x: g.stemX, noteY: beam.stemUp ? g.highest : g.lowest })),
        beam.stemUp,
        {
          stem: (STEM_LENGTH + Math.max(0, levels - 2) * BEAM_SPACING) * space,
          minStem,
          maxRise: BEAM_MAX_RISE * space,
        },
      );
  // Clear of another voice's notes under the beam (a beam across both staves has none in its way).
  const line = kneed
    ? plain
    : avoidNotes(
        plain,
        geometry.map((g) => ({ x: g.stemX, noteY: beam.stemUp ? g.highest : g.lowest })),
        beam.stemUp,
        otherVoiceHeads(context, beam, geometry),
        {
          band: (BEAM_THICKNESS + (levels - 1) * BEAM_SPACING) * space,
          clearance: BEAM_CLEARANCE * space,
          shortestStem: SHORTEST_BEAMED_STEM * space,
        },
      );
  beam.chords.forEach((index, i) => ink.stemEnds.set(index, beamY(line, geometry[i].stemX)));

  // Extra beams stack towards the notes: down under an up-stem beam, up over a down-stem one.
  const inward = beam.stemUp ? 1 : -1;
  const thickness = BEAM_THICKNESS * space;
  const halfStem = geometry[0].stemWidth / 2;
  const bar = (fromX: number, toX: number, level: number) => {
    const shift = inward * level * BEAM_SPACING * space;
    const y1 = beamY(line, fromX) + shift;
    const y2 = beamY(line, toX) + shift;
    const t = inward * thickness;
    return svg('polygon', {
      points: `${fromX},${y1} ${toX},${y2} ${toX},${y2 + t} ${fromX},${y1 + t}`,
      fill: 'currentColor',
    });
  };

  const shapes: SVGPolygonElement[] = [];
  const xs = geometry.map((g) => g.stemX);
  for (let level = 0; level < levels; level++) {
    // Runs of neighbouring chords short enough to need this level.
    const needs = chords.map((chord) => flagCount(chord.duration.value) > level);
    for (let i = 0; i < chords.length; i++) {
      if (!needs[i]) continue;
      let j = i;
      while (j + 1 < chords.length && needs[j + 1]) j++;
      if (j > i) {
        shapes.push(bar(xs[i] - halfStem, xs[j] + halfStem, level));
      } else {
        // A lone shorter note gets a stub pointing into the group.
        const towardsRight = i < chords.length - 1;
        const stub = BEAM_STUB * space;
        shapes.push(towardsRight ? bar(xs[i] - halfStem, xs[i] + stub, level) : bar(xs[i] - stub, xs[i] + halfStem, level));
      }
      i = j;
    }
  }
  return shapes;
}

/** Noteheads of the other chords on a beam's staff, within its reach: what the beam must keep off. */
function otherVoiceHeads({ geometry: { space }, ink }: StaffContext, beam: Beam, geometry: ChordGeometry[]): BeamObstacle[] {
  const staff = ink.chords[beam.chords[0]].staff;
  const left = Math.min(...geometry.map((g) => g.left)) - space;
  const right = Math.max(...geometry.map((g) => g.left + g.headWidth)) + space;
  const own = new Set(beam.chords);
  const heads: BeamObstacle[] = [];
  for (const index of ink.within(staff, left, right)) {
    if (own.has(index)) continue;
    const chord = ink.chords[index];
    const g = ink.of(chord);
    for (const note of chord.notes) {
      const y = g.yOf(note.step);
      heads.push({ x: g.left + g.headWidth / 2, top: y - space / 2, bottom: y + space / 2 });
    }
  }
  return heads;
}

/**
 * A tuplet's number (and bracket, if it has one) beyond the stems on their side: over a beam,
 * or over the notes of an unbeamed group.
 */
export function drawTuplet({ geometry: { space }, ink }: StaffContext, tuplet: Tuplet): SVGElement[] {
  const chords = tuplet.chords.map((index) => ink.chords[index]);
  const geometry = chords.map((chord) => ink.of(chord));
  // The outermost point of each chord on the tuplet's side: its stem end, or the notehead.
  const outer = tuplet.chords.map((index, i) => {
    const g = geometry[i];
    const stemmed = chords[i].duration.value !== 'whole' && chords[i].stemUp === tuplet.above;
    if (!stemmed) return tuplet.above ? g.highest - space : g.lowest + space;
    return ink.stemEnd(index);
  });
  const left = geometry[0].left;
  const right = geometry[geometry.length - 1].left + geometry[geometry.length - 1].headWidth;
  const center = (left + right) / 2;
  const direction = tuplet.above ? -1 : 1;
  // The line the number and bracket sit on, a little clear of the stems.
  const y = (tuplet.above ? Math.min(...outer) : Math.max(...outer)) + direction * 1.4 * space;

  const shapes: SVGElement[] = [];
  if (tuplet.showNumber) {
    const number = svg('text', {
      x: center,
      y: y + space * 0.75, // tuplet digits are about a space and a half tall
      fill: 'currentColor',
      'font-size': space * 3.4,
      'font-family': MUSIC_FONT,
      'text-anchor': 'middle',
    });
    number.textContent = tupletDigits(tuplet.number);
    shapes.push(number);
  }
  if (tuplet.bracket) {
    const gap = tuplet.showNumber ? space * 1.1 : 0;
    const hook = -direction * space * 0.8; // hooks point towards the notes
    const line = { stroke: 'currentColor', 'stroke-width': space * 0.12, fill: 'none' };
    shapes.push(
      svg('polyline', { points: `${left},${y + hook} ${left},${y} ${center - gap},${y}`, ...line }),
      svg('polyline', { points: `${center + gap},${y} ${right},${y} ${right},${y + hook}`, ...line }),
    );
  }
  return shapes;
}

/** A rest glyph (with its dot), centred on its beat. */
export function drawRest({ geometry }: StaffContext, rest: StaffRest): SVGTextElement[] {
  const { space } = geometry;
  const top = geometry.staffTop(rest.staff);
  const { value, dots } = rest.duration;
  const width = REST_WIDTH[value] * space;
  const left = geometry.at(rest.beat) - width / 2;
  const y = top + (rest.step * space) / 2;
  const glyphs = [noteGlyph(space, REST[value], left, y)];
  if (dots) glyphs.push(noteGlyph(space, AUGMENTATION_DOT, left + width + DOT_OFFSET * space, top + 1.5 * space));
  return glyphs;
}

/** An articulation or fermata, centred over (or under) the notehead. */
export function drawMark({ geometry: { space }, ink }: StaffContext, mark: StaffMark): SVGTextElement {
  const { yOf, left, headWidth } = ink.of(ink.chords[mark.chord]);
  const [above, below] = MARK_GLYPHS[mark.kind];
  const glyph = noteGlyph(space, mark.above ? above : below, left + headWidth / 2, yOf(mark.step));
  glyph.setAttribute('text-anchor', 'middle');
  return glyph;
}

/**
 * A phrasing slur. Each end sits just beyond its notehead, or beyond the stem end when the slur
 * is on the stem side; the curve then rises (or sinks) to clear every chord in between.
 */
export function drawSlur({ geometry: { space }, ink }: StaffContext, phrase: StaffSlur): SVGPathElement {
  const direction = phrase.above ? -1 : 1;
  const outerPoint = (index: number) => {
    const chord = ink.chords[index];
    const g = ink.of(chord);
    const stemmed = chord.duration.value !== 'whole';
    if (stemmed && chord.stemUp === phrase.above) {
      return { x: g.stemX, y: ink.stemEnd(index) + direction * SLUR_STEM_GAP * space };
    }
    return { x: g.left + g.headWidth / 2, y: (phrase.above ? g.highest : g.lowest) + direction * SLUR_HEAD_GAP * space };
  };
  const start = outerPoint(phrase.from);
  const end = outerPoint(phrase.to);
  const shape = slur({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    above: phrase.above,
    space,
    obstacles: phrase.between.map(outerPoint),
  });
  return svg('path', { d: shape.path, fill: 'currentColor' });
}

/** A tie: a crescent from one notehead to the next, curving away from the stems. */
export function drawTie({ geometry: { space }, ink }: StaffContext, tie: Tie): SVGPathElement {
  const from = ink.of(ink.chords[tie.from]);
  const to = ink.of(ink.chords[tie.to]);
  const y = from.yOf(tie.step) + (tie.above ? -1 : 1) * TIE_OFFSET * space;
  const shape = arc({
    x1: from.left + from.headWidth + TIE_GAP * space,
    x2: to.left - TIE_GAP * space,
    y,
    above: tie.above,
    space,
  });
  return svg('path', { d: shape.path, fill: 'currentColor' });
}
