import { keyAlteration, midiOf } from '../../../domain/notation/spelling';
import type { WrittenGrace, WrittenGraces } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { ACCIDENTALS, BEAM_VALUES, BLACK, FLAT, beamMarks, codePoint, isAccidental, pitchAt, sortedX,
  strips, top, within, type Measure, type Stem } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';
import { slurArc } from './pianoTies';

export function isGraceGlyph(glyph: PdfGlyph, space: number): boolean {
  const code = codePoint(glyph);
  return within(glyph.size, 3 * space, 0.12 * space)
    && (code === BLACK || isAccidental(glyph) || (code >= 0xe240 && code <= 0xe245));
}

function graceStems(geometry: PdfGeometry, head: PdfGlyph, space: number, museScore: boolean): Stem[] {
  return geometry.segments.flatMap<Stem>(line => {
    if (!within(line.x1, line.x2, space * 0.02)
      || museScore && !within(line.width, space * 0.077, space * 0.025)) return [];
    const lo = Math.min(line.y1, line.y2), hi = Math.max(line.y1, line.y2);
    const upX = museScore ? 0.871 : 0.835;
    if (within(line.x1, head.x + space * upX, space * 0.09)
      && within(lo, head.y + space * (museScore ? 0.09 : 0.12), space * 0.09)
      && hi > head.y + space * 1.5) return [{ x: line.x1, far: hi, up: true }];
    if (museScore && within(line.x1, head.x + space * 0.039, space * 0.08)
      && within(hi, head.y - space * 0.09, space * 0.09)
      && lo < head.y - space * 1.5) return [{ x: line.x1, far: lo, up: false }];
    return [];
  });
}

/** MuseScore can print a reduced member of a regular chord. A separate stem
 * starting at the reduced head distinguishes an independently drawn grace. */
export function museScoreGraceGlyphs(geometry: PdfGeometry, row: readonly PdfGlyph[], space: number): PdfGlyph[] {
  const small = row.filter(g => within(g.size, space * 2.8, space * 0.08));
  const anchors = small.filter(g => codePoint(g) === BLACK).flatMap(head =>
    graceStems(geometry, head, space, true).map(stem => ({ head, stem })));
  const heads = small.filter(g => codePoint(g) === BLACK && anchors.some(({ head, stem }) =>
    within(g.x, head.x, space * 0.03) && g.y >= Math.min(head.y, stem.far) && g.y <= Math.max(head.y, stem.far)));
  return small.filter(g => heads.includes(g) || isAccidental(g) && heads.some(head =>
    within(g.y, head.y, space * 0.09) && g.x < head.x && head.x - g.x < space * 1.3)
    || codePoint(g) >= 0xe240 && codePoint(g) <= 0xe245 && anchors.some(({ stem }) =>
      within(g.x, stem.x, space * 0.1) && within(g.y, stem.far, space * 0.1)));
}

/** Reduced noteheads attach to an independently timed principal on their staff.
 * Read the flag or beams at the stem tip, and the acciaccatura stroke across it. */
export function readBarGraces(geometry: PdfGeometry, measure: Measure, glyphs: readonly PdfGlyph[],
  positioned: readonly TimedNote[], fifths: number, noteOffset: number, museScoreRows?: readonly PdfGlyph[][]) {
  const notes = [...positioned];
  const curves = new Set<PdfGeometry['curvedFills'][number]>();
  const slurTargets: TimedNote[] = [];
  const graces: WrittenGraces[] = [];
  if (!glyphs.length && !museScoreRows?.some(row => row.length)) return { graces, curves, notes, slurTargets };
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  const space = upper.space;
  const museScore = !!museScoreRows;
  const beams = strips(geometry.fills, space * 0.75, museScore ? 1 : 0.5);
  for (const [staffIndex, staff] of measure.staves.entries()) {
    const symbols = sortedX(museScoreRows?.[staffIndex] ?? glyphs.filter(g => (g.y > middle) === (staffIndex === 0)));
    const consumed = new Set<PdfGlyph>();
    // A beam beginning on a grace stem must end within the same grace group.
    const openLevels = new Set<number>();
    let beamedTarget: number | undefined;
    const groups = new Map<number, WrittenGrace[]>();
    const graceAccidentals = new Map<number, { x: number; alteration: WrittenGrace['pitch']['alteration'] }>();
    const principals = sortedX(positioned.map((entry, index) => ({ ...entry, index }))
      .filter(entry => entry.note.staff === staffIndex + 1));
    for (const head of symbols.filter(g => codePoint(g) === BLACK)) {
      if (consumed.has(head)) continue;
      const chord = museScore ? symbols.filter(g => codePoint(g) === BLACK && within(g.x, head.x, space * 0.03))
        .sort((a, b) => a.y - b.y) : [head];
      const stems = chord.flatMap(member => graceStems(geometry, member, space, museScore));
      if (stems.length !== 1) return null;
      const stem = stems[0]!;
      const first = principals.find(entry => entry.x > head.x && (!museScore || !entry.note.chord));
      if (!first || first.x - head.x > space * 5) return null;
      const simultaneous = principals.filter(entry => entry.note.beat === first.note.beat
        && (!museScore || !entry.note.chord && entry.x > head.x));
      const targets = simultaneous.length > 1 && museScore
        ? simultaneous.filter(entry => entry.note.stem === (stem.up ? 'up' : 'down')) : simultaneous;
      if (targets.length !== 1) return null;
      const principal = targets[0]!;
      const transposition = principal.note.sounding - midiOf(principal.note.pitch);
      const flagBase = stem.up ? 0xe240 : 0xe241;
      const flags = symbols.filter(g => [flagBase, flagBase + 2, flagBase + 4].includes(codePoint(g))
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
      const value = BEAM_VALUES[flags.length ? 1 + (codePoint(flags[0]!) - flagBase) / 2 : levels.length];
      if (!value) return null;
      const cuts = geometry.segments.filter(s => {
        const [a, b] = sortedX([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]);
        return a!.x < stem.x && b!.x > stem.x && within(b!.x - a!.x, space * (museScore ? 1.27 : 1.12), space * 0.15)
          && within((b!.y - a!.y) * (stem.up ? 1 : -1), space * (museScore ? 0.8 : 1.12), space * 0.15)
          && Math.min(a!.y, b!.y) > Math.min(head.y, stem.far) && Math.max(a!.y, b!.y) < Math.max(head.y, stem.far);
      });
      const arcs = geometry.curvedFills.filter(contour => {
        const arc = slurArc(contour, space);
        return arc && within(arc.left.x, head.x + space * 0.44, space * 0.15)
          && within(arc.left.y, (arc.side < 0 ? chord[0]! : chord.at(-1)!).y + arc.side * space * 0.87, space * 0.15)
          && (within(arc.right.x, principal.x + space * (museScore ? 0.65 : -0.22), space * 0.15)
            || museScore && within(arc.right.x, principal.x - space * 0.3, space * 0.08))
          && within(arc.right.y, principal.y + arc.side * space * (museScore ? 0.9 : 0.61), space * 0.15);
      });
      if (arcs.length > 1) return null;
      if (arcs[0]) {
        const target = notes[principal.index]!;
        if (slurTargets.includes(target) || target.note.slurs.some(mark => mark.type === 'stop')) return null;
        slurTargets.push(target);
        curves.add(arcs[0]);
        if (!museScore) notes[principal.index] = { ...target, note: { ...target.note, slurs: [...target.note.slurs,
          { type: 'stop', number: target.note.staff, placement: null }] } };
      }
      for (const flag of flags) consumed.add(flag);
      const group = groups.get(principal.index) ?? [];
      for (const [index, member] of chord.entries()) {
        const accidentals = symbols.filter(g => isAccidental(g) && within(g.y, member.y, space * 0.09)
          && g.x < member.x && member.x - g.x < space * 1.3);
        if (accidentals.length > 1 || cuts.length > 1 || accidentals.some(g => consumed.has(g))) return null;
        const accidental = accidentals[0] && ACCIDENTALS[codePoint(accidentals[0]) - FLAT];
        const position = pitchAt(member.y, staff, principal.note.clef);
        if (!position) return null;
        const preceding = principals.filter(entry => entry.x < member.x && entry.note.pitch.letter === position.letter
          && entry.note.pitch.octave === position.octave).at(-1);
        const degree = position.octave * 7 + position.letter;
        const earlierGrace = graceAccidentals.get(degree);
        const carried = earlierGrace && earlierGrace.x > (preceding?.x ?? -Infinity)
          ? earlierGrace.alteration : preceding?.note.pitch.alteration;
        const pitch = { ...position, alteration: accidental?.[1] ?? carried ?? keyAlteration(position.letter, fifths) };
        if (accidental) graceAccidentals.set(degree, { x: member.x, alteration: accidental[1] });
        group.push({ staff: principal.note.staff, hand: principal.note.hand, clef: principal.note.clef, pitch,
          sounding: midiOf(pitch) + transposition, accidental: accidental?.[0] ?? null, chord: index > 0, slash: cuts.length > 0, value, slur: index === 0 && arcs.length > 0 });
        for (const glyph of [member, ...accidentals]) consumed.add(glyph);
      }
      groups.set(principal.index, group);
    }
    if (openLevels.size || symbols.some(g => !consumed.has(g))) return null;
    for (const [index, group] of groups) {
      const { bar, beat } = notes[index]!.note;
      graces.push({ bar, beat, leadsTo: noteOffset + index, notes: group });
    }
  }
  return { graces, curves, notes, slurTargets };
}
