import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry } from './geometry';
import { musicGlyphCode as code, isLegacyMusicGlyph } from './musicGlyphs';
import { applyPdfCurves } from './curves';
import { timeOf, strips } from './pianoGeometry';
import { alignedColumns, readStaff, isHead, type PlacedNote, type Onset } from './legacyStaff';
import { museScoreKey } from './pianoKey';
import { museScoreMeasures } from './museScoreMeasures';
import { applyMuseScoreDirections, type MuseScoreDirectionBar } from './museScoreDirections';
import { readLegacyGraces } from './legacyGraces';

export function readLegacyDocument(
  first: PdfGeometry,
  title: string,
  furtherPages: Iterable<PdfGeometry>,
  limit = Infinity,
): Notation | null {
  const bars: WrittenBar[] = [],
    notes: WrittenNote[] = [],
    rests: WrittenRest[] = [];
  const clefs: Notation['clefs'][number][] = [],
    keySignatures: Notation['keySignatures'][number][] = [];
  const timeSignatures: Notation['timeSignatures'][number][] = [];
  const active: Clef[] = ['treble', 'bass'];
  let beat = 0,
    fifths = 0,
    length = 0;
  const graces: Notation['graces'][number][] = [];
  const directionBars: MuseScoreDirectionBar[] = [];
  for (const geometry of [first, ...furtherPages]) {
    if (bars.length === limit) break;
    const measures = museScoreMeasures(geometry);
    if (!measures.length) return null;
    const beams = strips(geometry.fills, measures[0]!.staves[0].space, 1);
    const placed: PlacedNote[] = [];
    for (const measure of measures) {
      if (bars.length === limit) break;
      const [upper, lower] = measure.staves,
        space = upper.space,
        index = bars.length;
      const systemStart = measure.systemStart;
      if (measure.printedNumber !== undefined && measure.printedNumber !== index + 1) return null;
      const boundary = (upper.bottom + lower.bottom + 4 * space) / 2;
      const glyphs = geometry.glyphs.filter(
        (g) =>
          isLegacyMusicGlyph(g) &&
          g.x >= measure.left &&
          g.x < measure.right &&
          g.y > lower.bottom - space * 7 &&
          g.y < upper.bottom + space * 11,
      );
      if (glyphs.some((g) => !code(g) || code(g) === 0xe0a2)) return null;
      const upperRow = glyphs.filter((g) => g.y > boundary).sort((a, b) => a.x - b.x);
      const bodyStart =
        upperRow.find((g) => isHead(g) || (code(g) >= 0xe4e3 && code(g) <= 0xe4e8))?.x ?? measure.right;
      const digits = upperRow.filter((g) => g.x < bodyStart && code(g) >= 0xe080 && code(g) <= 0xe089);
      const common = upperRow.some((g) => g.x < bodyStart && code(g) === 0xe08a);
      const time = common
        ? { numerator: 4, denominator: 4 }
        : timeOf(
            digits.map((g) => ({ ...g, text: String.fromCodePoint(code(g)) })),
            upper,
          );
      if (time) {
        timeSignatures.push({ ...time, beat });
        length = (time.numerator * 4) / time.denominator;
      }
      if (!length) return null;

      const bar = { start: beat, length, navigation: {} };
      const barNotes: PlacedNote[] = [],
        columns: Onset[] = [];
      const rows = [upperRow, glyphs.filter(g => g.y <= boundary).sort((a, b) => a.x - b.x)];
      const signature = museScoreKey(rows, measure, active, fifths);
      if (!signature) return null;
      if (!index || signature.fifths !== fifths) keySignatures.push({ beat, fifths: signature.fifths, minor: false });
      fifths = signature.fifths;
      for (const [j, staff] of measure.staves.entries()) {
        const row = rows[j]!;
        const headerClef = row.find((g) => [0xe050, 0xe062].includes(code(g)) && g.size > space * 3.7);
        if (systemStart && !headerClef) return null;
        if (systemStart && headerClef) {
          const clef = code(headerClef) === 0xe050 ? 'treble' : 'bass';
          if (!index || active[j] !== clef) clefs.push({ beat, staff: j + 1, clef });
          active[j] = clef;
        }
        const changes: { x: number; clef: Clef }[] = row
          .filter((g) => [0xe050, 0xe062].includes(code(g)) && g.size < space * 3.7)
          .map((g) => ({ x: g.x, clef: (code(g) === 0xe050 ? 'treble' : 'bass') }));
        const content = row.filter((g) => !signature.marks[j]!.includes(g) && g.size > space * 3.7);
        const onsets: Onset[] = [];
        const ok = readStaff(
          geometry,
          content,
          staff,
          active[j]!,
          fifths,
          bar,
          index,
          j + 1,
          beams,
          barNotes,
          rests,
          onsets,
          true,
          changes,
        );
        if (!ok) return null;
        for (const c of changes) {
          const at = onsets.filter((o) => o.x > c.x).sort((a, b) => a.x - b.x)[0]?.beat ?? beat + length;
          clefs.push({ beat: at, staff: j + 1, clef: c.clef });
          active[j] = c.clef;
        }
        columns.push(...onsets);
      }
      if (
        !readLegacyGraces(
          geometry,
          measure,
          glyphs,
          boundary,
          barNotes,
          fifths,
          notes.length + placed.length,
          index,
          graces,
        )
      )
        return null;
      // A whole-measure rest is engraved at the center, independently of attack columns.
      const attacks = columns.filter((c) => !c.centeredRest);
      if (attacks.length && !alignedColumns(attacks, space)) return null;
      placed.push(...barNotes);
      directionBars.push({ geometry, measure, index, notes: barNotes, columns });
      bars.push(bar);
      beat += length;
    }
    notes.push(...applyPdfCurves(geometry, placed, measures[0]!.staves[0].space, true));
  }
  for (const group of graces) {
    if (group.leadsTo === null || !group.notes.some((n) => n.slur)) continue;
    const target = notes[group.leadsTo]!;
    notes[group.leadsTo] = { ...target, slurs: [{ type: 'stop', number: 1, placement: null }, ...target.slurs] };
  }
  return applyMuseScoreDirections(
    {
      title,
      bars,
      notes,
      rests,
      clefs,
      keySignatures,
      timeSignatures,
      tempos: [],
      tempoMarks: [],
      graces,
      pedalMoves: [],
      pedalMarks: [],
      octaveShifts: [],
      dynamics: [],
      dynamicLevels: [],
      words: [],
      hairpins: [],
    },
    directionBars,
  );
}
