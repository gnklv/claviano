import { wavyLine } from '../curves';
import type { StaffArpeggio, StaffOrnament, StaffTremolo } from '../../../domain/notation/engraving';
import type { StaffContext } from './context';
import { BAR_LINE_GAP } from './geometry';
import { ACCIDENTAL_GLYPH, MUSIC_FONT, ORNAMENT_GLYPHS } from './glyphs';
import { noteGlyph, svg } from './svg';

/*
 * Ornaments and the like, painted with `currentColor` so they light up with their chord: the
 * signs over a note (trill, mordent, turn), tremolo strokes and the wavy line of a rolled chord.
 * Sizes in staff spaces.
 */

/** A sign is about this tall, and "tr" this wide (a wavy line starts after it). */
const SIGN_HEIGHT = 1.8;
const TRILL_WIDTH = 1.9;
/** Small accidentals over and under a sign: their size, and their distance from the sign's edge. */
const ACCIDENTAL_SCALE = 0.6;
const ACCIDENTAL_GAP = 1.1;
/** Wavy lines: wave length, swing to either side, and thickness. */
const WAVE = 0.9;
const SWING = 0.22;
const WAVE_THICKNESS = 0.16;
/** Tremolo strokes: length along the stem's side, thickness, distance between them, and their slant. */
const STROKE_LENGTH = 1.3;
const STROKE_THICKNESS = 0.32;
const STROKE_SPACING = 0.55;
const STROKE_SLANT = 0.35;
/** A rolled chord's line stands this far before its noteheads (further when they have accidentals). */
const ARPEGGIO_GAP = 0.7;
const ARPEGGIO_PAST_ACCIDENTAL = 1.5;

const wave = (space: number, path: string) => svg('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': WAVE_THICKNESS * space, 'stroke-linecap': 'round' });

/** An ornament sign with its accidentals and, for a trill, its wavy line. */
export function drawOrnament({ geometry, ink }: StaffContext, ornament: StaffOrnament): SVGElement[] {
  const { space } = geometry;
  const chord = ink.chords[ornament.chord];
  const at = ink.of(chord);
  // Over the middle of the notehead, or where the layout says (a delayed turn stands after its note).
  const x = ornament.beat === chord.beat ? at.left + at.headWidth / 2 : geometry.at(ornament.beat, chord.bar);
  // `step` is the edge nearest the notes: the sign's baseline above them, its top below them.
  const edge = geometry.staffTop(chord.staff) + (ornament.step * space) / 2;
  const baseline = ornament.above ? edge : edge + SIGN_HEIGHT * space;
  const sign = noteGlyph(space, ORNAMENT_GLYPHS[ornament.kind], x, baseline);
  sign.setAttribute('text-anchor', 'middle');
  const shapes: SVGElement[] = [sign];

  const accidental = (name: NonNullable<StaffOrnament['accidentalAbove']>, y: number) => {
    const text = svg('text', { x, y, fill: 'currentColor', 'font-size': space * 4 * ACCIDENTAL_SCALE, 'font-family': MUSIC_FONT, 'text-anchor': 'middle' });
    text.textContent = ACCIDENTAL_GLYPH[name];
    return text;
  };
  if (ornament.accidentalAbove) shapes.push(accidental(ornament.accidentalAbove, baseline - (SIGN_HEIGHT + ACCIDENTAL_GAP) * space));
  if (ornament.accidentalBelow) shapes.push(accidental(ornament.accidentalBelow, baseline + ACCIDENTAL_GAP * space));

  if (ornament.lineTo !== null) {
    const from = x + (TRILL_WIDTH / 2 + 0.2) * space;
    const to = geometry.edgeAt(ornament.lineTo, chord.bar) - 0.4 * space;
    const y = baseline - 0.55 * space;
    if (to - from > WAVE * space) shapes.push(wave(space, wavyLine(from, y, to, y, WAVE * space, SWING * space)));
  }

  ink.add({
    staff: chord.staff,
    left: x - space,
    right: ornament.lineTo !== null ? geometry.edgeAt(ornament.lineTo, chord.bar) : x + space,
    top: baseline - (SIGN_HEIGHT + (ornament.accidentalAbove ? ACCIDENTAL_GAP + 1 : 0)) * space,
    bottom: baseline + (ornament.accidentalBelow ? ACCIDENTAL_GAP + 0.5 : 0) * space,
  });
  return shapes;
}

/** Tremolo strokes: slanted bars across a chord's stem, or between the stems of two chords. */
export function drawTremolo({ geometry, ink }: StaffContext, tremolo: StaffTremolo): SVGElement[] {
  const { space } = geometry;
  const chord = ink.chords[tremolo.chord];
  const at = ink.of(chord);
  const stemmed = chord.duration.value !== 'whole';
  const stroke = (x1: number, y1: number, x2: number, y2: number) => {
    const t = STROKE_THICKNESS * space;
    return svg('polygon', { points: `${x1},${y1} ${x2},${y2} ${x2},${y2 + t} ${x1},${y1 + t}`, fill: 'currentColor' });
  };
  const shapes: SVGElement[] = [];
  const stack = (place: (offset: number) => SVGElement) => {
    const spread = (tremolo.strokes - 1) * STROKE_SPACING * space;
    for (let i = 0; i < tremolo.strokes; i++) shapes.push(place(i * STROKE_SPACING * space - spread / 2 - (STROKE_THICKNESS * space) / 2));
  };

  if (tremolo.to === null) {
    // Across the stem, halfway along it; a whole note has none, so over (or under) its head.
    const x = stemmed ? at.stemX : at.left + at.headWidth / 2;
    const outer = chord.stemUp ? at.highest : at.lowest;
    const middle = stemmed ? (outer + ink.stemEnd(tremolo.chord)) / 2 : chord.stemUp ? at.highest - 1.8 * space : at.lowest + 1.8 * space;
    const half = (STROKE_LENGTH / 2) * space;
    const rise = (STROKE_SLANT / 2) * space;
    stack((offset) => stroke(x - half, middle + offset + rise, x + half, middle + offset - rise));
    return shapes;
  }

  // Between the two chords: from just after the first stem (or head) to just before the second.
  const other = ink.chords[tremolo.to];
  const to = ink.of(other);
  const inset = 0.5 * space;
  const from = (stemmed ? at.stemX : at.left + at.headWidth) + inset;
  const until = (other.duration.value !== 'whole' ? to.stemX : to.left) - inset;
  // Level with the stems' far half: where a beam between the two notes would be drawn, a little nearer the notes.
  const level = (index: number, g: typeof at, up: boolean) =>
    ink.chords[index].duration.value !== 'whole' ? ink.stemEnd(index) + (up ? 1 : -1) * space : up ? g.highest - 2.5 * space : g.lowest + 2.5 * space;
  const y1 = level(tremolo.chord, at, chord.stemUp);
  const y2 = level(tremolo.to, to, other.stemUp);
  stack((offset) => stroke(from, y1 + offset, until, y2 + offset));
  return shapes;
}

/** The wavy line before a rolled chord, from its top note to its bottom one (through both staves if need be). */
export function drawArpeggio({ geometry, ink }: StaffContext, arpeggio: StaffArpeggio): SVGElement[] {
  const { space } = geometry;
  const chords = arpeggio.chords.map((index) => ink.chords[index]);
  const places = chords.map((chord) => ink.of(chord));
  const lefts = chords.map((chord, i) => places[i].left - (chord.notes.some((note) => note.accidental) ? ARPEGGIO_PAST_ACCIDENTAL : 0) * space);
  // Never on the bar line: a chord at the start of a bar keeps the line within its own bar.
  const x = Math.max(Math.min(...lefts) - ARPEGGIO_GAP * space, geometry.barLineX(chords[0].bar) + (BAR_LINE_GAP / 4) * space);
  const top = Math.min(...places.map((place) => place.highest)) - 0.6 * space;
  const bottom = Math.max(...places.map((place) => place.lowest)) + 0.6 * space;
  const shapes: SVGElement[] = [wave(space, wavyLine(x, top, x, bottom, WAVE * space, SWING * space))];
  if (arpeggio.down) {
    const tip = bottom + 0.5 * space;
    shapes.push(svg('polygon', { points: `${x - 0.35 * space},${bottom - 0.1 * space} ${x + 0.35 * space},${bottom - 0.1 * space} ${x},${tip}`, fill: 'currentColor' }));
  }
  return shapes;
}
