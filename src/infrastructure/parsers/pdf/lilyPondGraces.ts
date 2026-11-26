import { keyAlteration, midiOf } from '../../../domain/notation/spelling';
import type { WrittenGrace, WrittenGraces } from '../../../domain/notation/written';
import { isCurveRibbon } from './curves';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { ACCIDENTALS, BEAM_VALUES, BLACK, FLAT, beamMarks, codePoint, isAccidental, isHead,
  pitchAt, printedClef, strips, within, type Staff } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

export function lilyGraceSymbol(g: PdfGlyph, space: number) {
  const code = codePoint(g);
  return g.size > space * 2.35 && g.size < space * 3.1 && (isHead(g) || isAccidental(g)
    || code >= 0xe240 && code <= 0xe245 || code === 0xe564);
}

/** A grace flag can extend across the midpoint between systems. Its stem
 * attaches it to a head even when the two glyphs are nearest different staves. */
export function lilyGraceAnchors(geometry: PdfGeometry, space: number): Map<PdfGlyph, PdfGlyph> {
  const small = geometry.glyphs.filter(g => lilyGraceSymbol(g, space));
  const heads = small.filter(isHead);
  const anchors = new Map<PdfGlyph, PdfGlyph>();
  for (const mark of small.filter(g => !isHead(g) && !isAccidental(g))) {
    const stems = geometry.segments.filter(s => within(s.x1, mark.x, space * .12)
      && within(s.y2, mark.y, space * .12));
    if (stems.length !== 1) continue;
    const stem = stems[0]!;
    const attached = heads.filter(h => within(stem.x1 - h.x, space * .88, space * .12)
      && within(stem.y1 - h.y, space * .16, space * .1));
    if (attached.length === 1) anchors.set(mark, attached[0]!);
  }
  return anchors;
}

/** A reduced head is a grace only with its own stem and a flag or a closed beam group. */
export function lilyPondGraces(geometry: PdfGeometry, row: PdfGlyph[], staff: Staff, staffNumber: number,
  notes: TimedNote[], key: number, offset: number): WrittenGraces[] | null {
  const { space } = staff;
  const symbols = row.filter(g => lilyGraceSymbol(g, space));
  if (!symbols.length) return [];
  const beams = strips(geometry.fills, space * .71, 1);
  const principals = notes.map((entry, index) => ({ ...entry, index })).filter(e => e.note.staff === staffNumber)
    .sort((a, b) => a.x - b.x);
  const consumed = new Set<PdfGlyph>();
  const groups = new Map<number, WrittenGrace[]>();
  const open = new Set<number>();
  const previousGrace = new Map<number, { x: number; pitch: WrittenGrace['pitch'] }>();
  let lastTarget = -1;
  for (const head of symbols.filter(isHead)) {
    const first = principals.find(e => e.x > head.x);
    const principal = first && principals.find(e => e.note.beat === first.note.beat && !e.note.chord);

    if (codePoint(head) !== BLACK || !principal || principal.x - head.x > space * 7
      || row.some(g => g.x > head.x && g.x < first.x && (printedClef(codePoint(g))
        || codePoint(g) >= 0xe4e3 && codePoint(g) <= 0xe4e8))
      || (open.size && lastTarget !== principal.index)
      || principals.some(e => e.note.beat === principal.note.beat && e.note.voice !== principal.note.voice)) return null;
    const stems = geometry.segments.filter(s => within(s.x1 - head.x, space * .88, space * .12)
      && within(s.y1 - head.y, space * .16, space * .1) && s.y2 > head.y + 1.5 * space);
    if (stems.length !== 1) return null;
    const stem = { x: stems[0]!.x1, far: stems[0]!.y2, up: true };
    const atTip = symbols.filter(g => within(g.x, stem.x, space * .12) && within(g.y, stem.far, space * .12));
    const flags = atTip.filter(g => [0xe240, 0xe242, 0xe244].includes(codePoint(g)));
    const slashes = atTip.filter(g => codePoint(g) === 0xe564);
    const levels = beamMarks(stem, beams, space * .8);
    if ((flags.length === 1) === Boolean(levels.length) || flags.length > 1 || slashes.length > 1) return null;
    for (const [i, mark] of levels.entries()) {
      if (mark === 'begin' && !open.has(i)) open.add(i);
      else if (mark === 'end' && open.has(i)) open.delete(i);
      else if (mark !== 'continue' || !open.has(i)) return null;
    }
    if ([...open].some(i => i >= levels.length)) return null;
    const value = BEAM_VALUES[flags.length ? 1 + (codePoint(flags[0]!) - 0xe240) / 2 : levels.length];
    const position = pitchAt(head.y, staff, principal.note.clef);
    if (!value || !position) return null;
    const marks = symbols.filter(g => isAccidental(g) && g.x < head.x && head.x - g.x < space * 1.45
      && within(g.y, head.y, space * .1));
    if (marks.length > 1 || [head, ...marks, ...flags, ...slashes].some(g => consumed.has(g))) return null;
    for (const g of [head, ...marks, ...flags, ...slashes]) consumed.add(g);
    const accidental = marks[0] && ACCIDENTALS[codePoint(marks[0]) - FLAT];
    // A printed grace accidental remains in force for subsequent notes of the same degree in the bar.
    if (accidental) {
      for (const entry of principals.filter(e => e.x > head.x && e.note.pitch.letter === position.letter
        && e.note.pitch.octave === position.octave)) {
        if (entry.note.accidental) break;
        const pitch = { ...entry.note.pitch, alteration: accidental[1] };
        entry.note = { ...entry.note, pitch, sounding: entry.note.sounding + midiOf(pitch) - midiOf(entry.note.pitch) };
        notes[entry.index] = { ...notes[entry.index]!, note: entry.note };
      }
    }
    const previous = principals.filter(e => e.x < head.x && e.note.pitch.letter === position.letter
      && e.note.pitch.octave === position.octave).at(-1);
    const group = groups.get(principal.index) ?? [];
    const degree = position.letter + 7 * position.octave;
    const last = previousGrace.get(degree);
    const priorPitch = last && (!previous || last.x > previous.x) ? last.pitch : previous?.note.pitch;
    const alteration = accidental?.[1] ?? priorPitch?.alteration ?? keyAlteration(position.letter, key);
    const pitch = { ...position, alteration };
    previousGrace.set(degree, { x: head.x, pitch });
    // The start of a steep descending slur can be lowered to clear ledger lines.
    // Match both head centers and the contour's direction at the principal.
    const slurs = geometry.curvedFills.filter(contour => {
      if (!isCurveRibbon(contour, space)) return false;
      const curve = contour[0]!;
      const [left, right] = curve.from.x < curve.to.x ? [curve.from, curve.to] : [curve.to, curve.from];
      const side = Math.sign(right.y - principal.y);
      const gap = side * (left.y - head.y) / space;
      if (!within(left.x - head.x, space * .4, space * .22)
        || !within(right.x - principal.x, space * .5, space * .23)
        || !within(Math.abs(right.y - principal.y), space * 1.1, space * .3)
        || gap < .6 || gap > 3.2 || right.x <= left.x) return false;
      return [curve.control1, curve.control2].every(p => side *
        (p.y - left.y - (p.x - left.x) * (right.y - left.y) / (right.x - left.x)) > space * .12);
    });
    if (slurs.length > 1) return null;
    if (slurs.length) {
      if (principal.note.slurs.some(mark => mark.type === 'stop')) return null;
      principal.note = { ...principal.note, slurs: [...principal.note.slurs,
        { type: 'stop', number: staffNumber, placement: null }] };
      notes[principal.index] = { ...notes[principal.index]!, note: principal.note };
    }
    group.push({ pitch, sounding: midiOf(pitch) + principal.note.sounding - midiOf(principal.note.pitch),
      hand: principal.note.hand, clef: principal.note.clef, staff: staffNumber, accidental: accidental?.[0] ?? null,
      chord: false, slash: Boolean(slashes.length), value, slur: Boolean(slurs.length) });
    groups.set(principal.index, group);
    lastTarget = principal.index;
  }
  if (open.size || symbols.some(g => !consumed.has(g))) return null;
  return [...groups].map(([index, group]) => ({ bar: notes[index]!.note.bar, beat: notes[index]!.note.beat,
    leadsTo: offset + index, notes: group }));
}
