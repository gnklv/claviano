import { slur } from '../curves';
import type { StaffGrace } from '../notationLayout';
import type { StaffContext } from './context';
import { ACCIDENTAL_GLYPH, FLAG_UP, HEAD_WIDTH, MUSIC_FONT, NOTEHEAD } from './glyphs';
import { COLORS, svg } from './svg';

/*
 * Grace notes: small notes to the left of the note they lead to, stems up. A lone one has a flag
 * (struck through for an acciaccatura); several share beams. All sizes in staff spaces.
 */

/** How much smaller than an ordinary note. */
const SCALE = 0.65;
const HEAD = HEAD_WIDTH.quarter * SCALE;
/** From one grace note to the next, and the extra room one with an accidental takes on its left. */
const ADVANCE = HEAD + 0.45;
const ACCIDENTAL_ROOM = 0.75;
/**
 * Between the last grace note and the note it leads to: room for a lone note's flag, which hangs
 * to the right of its stem; less for a beamed group; and more when that note has an accidental.
 */
const GAP_FLAGGED = 1.0;
const GAP_BEAMED = 0.65;
const ACCIDENTAL_OF_PRINCIPAL = 1.7;
/** Grace notes after the last note of a bar stop this far before the bar line. */
const BEFORE_BAR_LINE = 0.6;
const STEM = 2.4;
const SHORTEST_STEM = 1.7;
const STEM_WIDTH = 0.1;
const BEAM_THICKNESS = 0.32;
const BEAM_SPACING = 0.5;
const LEDGER_EXTENSION = 0.25;

const gap = (grace: StaffGrace, principalHasAccidental: boolean): number =>
  (grace.slots.length === 1 ? GAP_FLAGGED : GAP_BEAMED) + (principalHasAccidental ? ACCIDENTAL_OF_PRINCIPAL : 0);

/** How much room a group of grace notes takes to the left of the note it leads to. */
export function graceWidth(grace: StaffGrace, principalHasAccidental: boolean): number {
  const accidentals = grace.slots.filter((slot) => slot.notes.some((note) => note.accidental)).length;
  return gap(grace, principalHasAccidental) + grace.slots.length * ADVANCE + accidentals * ACCIDENTAL_ROOM;
}

/**
 * A group of grace notes as one element painted with `currentColor`, so it lights up as a whole
 * while it sounds. It is added to the ink, for what is drawn around the notes to keep clear of it.
 */
export function drawGrace({ geometry, ink }: StaffContext, grace: StaffGrace): SVGGElement {
  const { space } = geometry;
  const group = svg('g');
  group.style.color = COLORS.note;
  const top = geometry.staffTop(grace.staff);
  const yOf = (step: number) => top + (step * space) / 2;
  const glyph = (codepoint: string, x: number, y: number) => {
    const text = svg('text', { x, y, fill: 'currentColor', 'font-size': space * 4 * SCALE, 'font-family': MUSIC_FONT });
    text.textContent = codepoint;
    return text;
  };

  // Right to left from the note they lead to (or from the bar line).
  const principal = grace.principal === null ? null : ink.chords[grace.principal];
  const principalAt = principal ? ink.of(principal) : null;
  const principalHasAccidental = principal?.notes.some((note) => note.accidental) ?? false;
  let right = principalAt
    ? principalAt.left - gap(grace, principalHasAccidental) * space
    : geometry.barLineX(grace.bar + 1) - BEFORE_BAR_LINE * space;
  const lefts: number[] = new Array(grace.slots.length);
  for (let i = grace.slots.length - 1; i >= 0; i--) {
    lefts[i] = right - HEAD * space;
    right = lefts[i] - (ADVANCE - HEAD) * space - (grace.slots[i].notes.some((note) => note.accidental) ? ACCIDENTAL_ROOM * space : 0);
  }

  const stemWidth = STEM_WIDTH * space;
  const stemX = (i: number) => lefts[i] + HEAD * space - stemWidth / 2;
  const highest = grace.slots.map((slot) => yOf(slot.notes[0].step));
  const lowest = grace.slots.map((slot) => yOf(slot.notes[slot.notes.length - 1].step));

  // Stem ends: a stem's length over each note; for a group, on one straight line between the
  // first and the last, raised until every stem is long enough.
  const last = grace.slots.length - 1;
  const line = (i: number) =>
    last === 0 ? highest[0] - STEM * space : highest[0] - STEM * space + ((highest[last] - highest[0]) * (stemX(i) - stemX(0))) / (stemX(last) - stemX(0));
  const lift = Math.max(0, ...grace.slots.map((_, i) => line(i) - (highest[i] - SHORTEST_STEM * space)));
  const stemEnd = (i: number) => line(i) - lift;

  grace.slots.forEach((slot, i) => {
    for (const step of slot.ledgerSteps) {
      const y = yOf(step);
      const extension = LEDGER_EXTENSION * space;
      group.append(
        svg('line', { x1: lefts[i] - extension, x2: lefts[i] + HEAD * space + extension, y1: y, y2: y, stroke: 'currentColor', 'stroke-width': space * 0.13 }),
      );
    }
    for (const note of slot.notes) {
      const y = yOf(note.step);
      group.append(glyph(NOTEHEAD.quarter, lefts[i], y));
      if (note.accidental) group.append(glyph(ACCIDENTAL_GLYPH[note.accidental], lefts[i] - ACCIDENTAL_ROOM * space, y));
    }
    group.append(
      svg('line', { x1: stemX(i), x2: stemX(i), y1: lowest[i] - space * 0.17 * SCALE, y2: stemEnd(i), stroke: 'currentColor', 'stroke-width': stemWidth }),
    );
  });

  if (last === 0) {
    group.append(glyph(FLAG_UP[Math.min(3, grace.beams)], stemX(0) - stemWidth / 2, stemEnd(0)));
  } else {
    const from = stemX(0) - stemWidth / 2;
    const to = stemX(last) + stemWidth / 2;
    const thickness = BEAM_THICKNESS * space;
    for (let level = 0; level < Math.min(3, grace.beams); level++) {
      const y1 = stemEnd(0) + level * BEAM_SPACING * space;
      const y2 = stemEnd(last) + level * BEAM_SPACING * space;
      group.append(svg('polygon', { points: `${from},${y1} ${to},${y2} ${to},${y2 + thickness} ${from},${y1 + thickness}`, fill: 'currentColor' }));
    }
  }
  if (grace.slash) {
    // Through the flag of a lone note, or the stem and beam of a group's first one.
    const x = stemX(0);
    const y = stemEnd(0) + 1.05 * space;
    group.append(
      svg('line', { x1: x - 0.55 * space, x2: x + 0.75 * space, y1: y + 0.45 * space, y2: y - 0.45 * space, stroke: 'currentColor', 'stroke-width': space * 0.1 }),
    );
  }

  ink.add({
    staff: grace.staff,
    left: lefts[0] - ACCIDENTAL_ROOM * space,
    right: lefts[last] + (HEAD + 0.7) * space,
    top: Math.min(...grace.slots.map((_, i) => stemEnd(i))),
    bottom: Math.max(...lowest) + (space * SCALE) / 2,
  });

  if (grace.slur && principalAt) {
    // Under the heads (the grace notes' stems go up), ending just before the note it leads to.
    const shape = slur({
      x1: lefts[last] + (HEAD * space) / 2,
      y1: lowest[last] + 0.7 * space,
      x2: principalAt.left - 0.1 * space,
      y2: principalAt.lowest + 0.6 * space,
      above: false,
      space,
    });
    group.append(svg('path', { d: shape.path, fill: 'currentColor' }));
  }
  return group;
}
