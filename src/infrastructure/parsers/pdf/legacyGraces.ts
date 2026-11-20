import type { Notation } from '../../../domain/notation/notation';
import { keyAlteration, midiOf, type Alteration } from '../../../domain/notation/spelling';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { musicGlyphCode as code } from './musicGlyphs';
import { ACCIDENTALS, BEAM_VALUES, beamMarks, strips, pitchAt, type Measure } from './pianoGeometry';
import { close, stemFor, isHead, type PlacedNote } from './legacyStaff';

export function readLegacyGraces(
  geometry: PdfGeometry,
  measure: Measure,
  glyphs: PdfGlyph[],
  boundary: number,
  barNotes: PlacedNote[],
  fifths: number,
  firstNote: number,
  index: number,
  graces: Notation['graces'][number][],
): boolean {
  const space = measure.staves[0].space;
  for (const [j, staff] of measure.staves.entries()) {
    const small = glyphs.filter((g) => g.size < space * 3.7 && (j === 0 ? g.y > boundary : g.y <= boundary));
    const heads = small.filter(isHead).sort((a, b) => a.x - b.x);
    const graceBeams = strips(geometry.fills, space * 0.7, 1);
    const marks = barNotes.filter(n => n.note.staff === j + 1 && n.note.accidental).sort((a, b) => a.x - b.x);
    const alterations = new Map<number, Alteration>();
    let markIndex = 0;
    for (const head of heads) {
      while (markIndex < marks.length && marks[markIndex]!.x < head.x) {
        const pitch = marks[markIndex++]!.note.pitch;
        alterations.set(pitch.octave * 7 + pitch.letter, pitch.alteration);
      }
      const target = barNotes.filter((n) => n.note.staff === j + 1 && n.x > head.x).sort((a, b) => a.x - b.x)[0];
      if (!target) return false;
      const clef = target.note.clef,
        pos = pitchAt(head.y, staff, clef);
      if (!pos) return false;
      const printed = small.find(
        (g) =>
          code(g) >= 0xe260 &&
          code(g) <= 0xe264 &&
          close(g.y, head.y, space * 0.1) &&
          g.x < head.x &&
          head.x - g.x < space * 2,
      );
      const accidental = printed && ACCIDENTALS[code(printed) - 0xe260];
      const degree = pos.octave * 7 + pos.letter;
      if (accidental) alterations.set(degree, accidental[1]);
      const pitch = { ...pos, alteration: alterations.get(degree) ?? keyAlteration(pos.letter, fifths) };
      const stem = stemFor(
        head,
        geometry.segments.filter((s) => close(s.x1, s.x2, 0.02) && Math.abs(s.y1 - s.y2) < space * 5),
        space * 0.7,
      );
      if (!stem) return false;
      const far = Math.abs(stem.y1 - head.y) > Math.abs(stem.y2 - head.y) ? stem.y1 : stem.y2;
      const flag = small.find(
        (g) =>
          code(g) >= 0xe240 &&
          code(g) <= 0xe245 &&
          close(g.x, stem.x1, space * 0.2) &&
          close(g.y, far, space * 0.3),
      );
      const flags = flag
        ? 1 + Math.floor((code(flag) - 0xe240) / 2)
        : beamMarks({ x: stem.x1, far, up: far > head.y }, graceBeams, space * 0.7).length;
      const value = BEAM_VALUES[flags];
      if (!value) return false;
      const slur = geometry.curvedFills.some(
        (c) =>
          c.length === 2 &&
          close(c[0]!.from.x, head.x + space * 0.46, space * 0.25) &&
          close(c[0]!.from.y, head.y, space * 1.4) &&
          close(c[0]!.to.x, target.x + space * 0.15, space * 0.65),
      );
      const note = {
        staff: j + 1,
        hand: target.note.hand,
        clef,
        pitch,
        sounding: midiOf(pitch),
        accidental: accidental?.[0] ?? null,
        chord: false,
        value,
        slash: !!flag && flags === 1,
        slur,
      };
      const leadsTo = firstNote + barNotes.indexOf(target);
      const prior = graces.at(-1);
      if (prior && prior.leadsTo === leadsTo)
        graces[graces.length - 1] = { ...prior, notes: [...prior.notes, note] };
      else graces.push({ bar: index, beat: target.note.beat, leadsTo, notes: [note] });
    }
  }
  return true;
}
