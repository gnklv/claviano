import { keyAlteration, midiOf } from '../../../domain/notation/spelling';
import type { WrittenGrace, WrittenGraces } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { ACCIDENTALS, BEAM_VALUES, BLACK, FLAT, beamMarks, codePoint, isAccidental, pitchAt, sortedX,
  strips, top, within, type Measure } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';
import { slurArc } from './pianoTies';

export function isGraceGlyph(glyph: PdfGlyph, space: number): boolean {
  const code = codePoint(glyph);
  return within(glyph.size, 3 * space, 0.12 * space)
    && (code === BLACK || isAccidental(glyph) || (code >= 0xe240 && code <= 0xe245));
}

/** Reduced noteheads attach to an independently timed principal on their staff.
 * Read the flag or beams at the stem tip, and the acciaccatura stroke across it. */
export function readBarGraces(geometry: PdfGeometry, measure: Measure, glyphs: readonly PdfGlyph[],
  positioned: readonly TimedNote[], fifths: number, noteOffset: number) {
  const notes = [...positioned];
  const curves = new Set<PdfGeometry['curvedFills'][number]>();
  const graces: WrittenGraces[] = [];
  if (!glyphs.length) return { graces, curves, notes };
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  const space = upper.space;
  const beams = strips(geometry.fills, space * 0.75);
  for (const [staffIndex, staff] of measure.staves.entries()) {
    const symbols = sortedX(glyphs.filter(g => (g.y > middle) === (staffIndex === 0)));
    const consumed = new Set<PdfGlyph>();
    // A beam beginning on a grace stem must end within the same grace group.
    const openLevels = new Set<number>();
    let beamedTarget: number | undefined;
    const groups = new Map<number, WrittenGrace[]>();
    const principals = sortedX(positioned.map((entry, index) => ({ ...entry, index }))
      .filter(entry => entry.note.staff === staffIndex + 1));
    for (const head of symbols.filter(g => codePoint(g) === BLACK)) {
      const principal = principals.find(entry => entry.x > head.x);
      if (!principal || principal.x - head.x > space * 5 || principals.some(entry =>
        entry !== principal && entry.note.beat === principal.note.beat)) return null;
      const stems = geometry.segments.filter(line => within(line.x1, line.x2, space * 0.02)
        && within(line.x1, head.x + space * 0.835, space * 0.09)
        && within(Math.min(line.y1, line.y2), head.y + space * 0.12, space * 0.09)
        && Math.max(line.y1, line.y2) > head.y + space * 1.5);
      if (stems.length !== 1) return null;
      const line = stems[0]!;
      const stem = { x: line.x1, far: Math.max(line.y1, line.y2), up: true };
      const flags = symbols.filter(g => [0xe240, 0xe242, 0xe244].includes(codePoint(g))
        && within(g.x, stem.x, space * 0.1) && within(g.y, stem.far, space * 0.1));
      const levels = beamMarks(stem, beams, space * 0.75);
      if (flags.length > 1 || (flags.length > 0) === (levels.length > 0)) return null;
      if (openLevels.size && beamedTarget !== principal.index) return null;
      for (const [level, mark] of levels.entries()) {
        if (mark === 'begin') {
          if (openLevels.has(level)) return null;
          openLevels.add(level);
        } else if (!openLevels.has(level)) return null;
        else if (mark === 'end') openLevels.delete(level);
        else if (mark !== 'continue') return null;
      }
      if ([...openLevels].some(level => level >= levels.length)) return null;
      beamedTarget = principal.index;
      const value = BEAM_VALUES[flags.length ? 1 + (codePoint(flags[0]!) - 0xe240) / 2 : levels.length];
      if (!value) return null;
      const cuts = geometry.segments.filter(s => {
        const [a, b] = sortedX([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]);
        return a!.x < stem.x && b!.x > stem.x && within(b!.x - a!.x, space * 1.12, space * 0.15)
          && within(b!.y - a!.y, space * 1.12, space * 0.15) && a!.y > head.y && b!.y < stem.far;
      });
      const accidentals = symbols.filter(g => isAccidental(g) && within(g.y, head.y, space * 0.09)
        && g.x < head.x && head.x - g.x < space * 1.3);
      if (accidentals.length > 1 || cuts.length > 1 || [...flags, ...accidentals].some(g => consumed.has(g))) return null;
      const accidental = accidentals[0] && ACCIDENTALS[codePoint(accidentals[0]) - FLAT];
      const position = pitchAt(head.y, staff, principal.note.clef);
      if (!position) return null;
      const preceding = principals.filter(entry => entry.x < head.x && entry.note.pitch.letter === position.letter
        && entry.note.pitch.octave === position.octave).at(-1);
      const pitch = { ...position, alteration: accidental?.[1] ?? preceding?.note.pitch.alteration ?? keyAlteration(position.letter, fifths) };
      const arcs = geometry.curvedFills.filter(contour => {
        const arc = slurArc(contour, space);
        return arc && within(arc.left.x, head.x + space * 0.44, space * 0.15)
          && within(arc.left.y, head.y + arc.side * space * 0.87, space * 0.15)
          && within(arc.right.x, principal.x - space * 0.22, space * 0.15)
          && within(arc.right.y, principal.y + arc.side * space * 0.61, space * 0.15);
      });
      if (arcs.length > 1) return null;
      if (arcs[0]) {
        const target = notes[principal.index]!;
        if (target.note.slurs.some(mark => mark.type === 'stop')) return null;
        curves.add(arcs[0]);
        notes[principal.index] = { ...target, note: { ...target.note, slurs: [...target.note.slurs,
          { type: 'stop', number: target.note.staff, placement: null }] } };
      }
      for (const g of [head, ...flags, ...accidentals]) consumed.add(g);
      const group = groups.get(principal.index) ?? [];
      group.push({ staff: principal.note.staff, hand: principal.note.hand, clef: principal.note.clef, pitch,
        sounding: midiOf(pitch), accidental: accidental?.[0] ?? null, chord: false, slash: cuts.length > 0, value, slur: arcs.length > 0 });
      groups.set(principal.index, group);
    }
    if (openLevels.size || symbols.some(g => !consumed.has(g))) return null;
    for (const [index, group] of groups) {
      const { bar, beat } = notes[index]!.note;
      graces.push({ bar, beat, leadsTo: noteOffset + index, notes: group });
    }
  }
  return { graces, curves, notes };
}
