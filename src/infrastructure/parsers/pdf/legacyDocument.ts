import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { Clef, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { musicGlyphCode as code, isLegacyMusicGlyph } from './musicGlyphs';
import { applyMuseScoreCurves } from './museScoreCurves';
import { owningStaff, timeOf, strips, type Staff } from './pianoGeometry';
import { alignedColumns, readStaff, isHead, type PlacedNote, type Onset } from './legacyStaff';
import { museScoreKey } from './pianoKey';
import { museScoreMeasures, type MuseScoreMeasure } from './museScoreMeasures';
import { applyMuseScoreDirections, type MuseScoreDirectionBar } from './museScoreDirections';
import { readLegacyGraces } from './legacyGraces';

function hasLedgerLines(head: PdfGlyph, staff: Staff, geometry: PdfGeometry): boolean {
  const { bottom, space } = staff;
  const side = head.y < bottom ? -1 : 1;
  const edge = side < 0 ? bottom : bottom + 4 * space;
  const count = Math.floor(side * (head.y - edge) / space + 0.05);
  for (let i = 1; i <= count; i++) {
    const y = edge + side * i * space;
    if (!geometry.segments.some(line => Math.abs(line.y1 - y) < space * 0.06
      && Math.abs(line.y2 - y) < space * 0.06 && line.x1 < head.x && line.x2 > head.x + space
      && line.x2 - line.x1 < space * 4)) return false;
  }
  return count > 0;
}

function staffRows(geometry: PdfGeometry, measure: MuseScoreMeasure, measures: MuseScoreMeasure[],
  glyphs: PdfGlyph[], boundary: number): [PdfGlyph[], PdfGlyph[]] {
  const nearby = measures.filter(other => Math.abs(other.system - measure.system) <= 1
    && other.left < measure.right && other.right > measure.left);
  const [upper, lower] = measure.staves;
  const rows: [PdfGlyph[], PdfGlyph[]] = [[], []];
  for (const g of glyphs) {
    const symbol = code(g);
    // A flag attaches to a stem tip, which can extend over the neighboring staff.
    if (symbol >= 0xe240 && symbol <= 0xe245) {
      for (const row of rows) row.push(g);
      continue;
    }
    let owner = g.y > boundary ? upper : lower;
    const head = isHead(g) || symbol === 0xe0a2;
    if (head || symbol >= 0xe4e3 && symbol <= 0xe4f5) {
      const candidates = nearby.filter(other => other.left <= g.x && g.x < other.right).flatMap(other => other.staves);
      if (head) {
        // A continuous run of ledger lines identifies the staff even where
        // both staff grids coincide and the head is nearer the other staff.
        const between = candidates.every(c => g.y < c.bottom - c.space * 0.9 || g.y > c.bottom + c.space * 4.9);
        const ledgers = between ? candidates.filter(c => hasLedgerLines(g, c, geometry)) : [];
        owner = ledgers.length === 1 ? ledgers[0]! : owningStaff({ ...g, text: String.fromCodePoint(symbol) }, candidates, geometry);
      } else {
        const distance = (s: Staff) => Math.abs(g.y - s.bottom - 2 * s.space);
        owner = candidates.reduce((best, s) => distance(s) < distance(best) ? s : best);
      }
    }
    if (owner === upper) rows[0].push(g);
    if (owner === lower) rows[1].push(g);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

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
  const fades: Notation['words'][number][] = [];
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
      if (glyphs.some((g) => !code(g))) return null;
      const rows = staffRows(geometry, measure, measures, glyphs, boundary);
      const upperRow = rows[0];
      const bodyStart =
        upperRow.find((g) => isHead(g) || code(g) === 0xe0a2 || (code(g) >= 0xe4e3 && code(g) <= 0xe4e8))?.x ?? measure.right;
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
        // Accidentals of ledger notes can sit inside the other staff's half
        // of the system. Associate them with the head at their exact height.
        const across = rows[1 - j]!.filter(g => code(g) >= 0xe260 && code(g) <= 0xe264
          && !signature.marks[1 - j]!.includes(g) && g.size > space * 3.7
          && content.some(h => (isHead(h) || code(h) === 0xe0a2) && Math.abs(h.y - g.y) < space * 0.18
            && h.x > g.x && h.x - g.x < space * 5));
        content.push(...across);
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
      for (const glyph of glyphs.filter(g => [0xe843, 0xe844].includes(code(g)))) {
        const nearest = attacks.reduce<Onset | undefined>((best, onset) =>
          !best || Math.abs(onset.x - glyph.x) < Math.abs(best.x - glyph.x) ? onset : best, undefined);
        if (nearest) fades.push({ text: code(glyph) === 0xe843 ? 'Fade in' : 'Fade out', beat: nearest.beat,
          below: glyph.y < boundary, tempo: false });
      }
      placed.push(...barNotes);
      directionBars.push({ geometry, measure, index, notes: barNotes, columns });
      bars.push(bar);
      beat += length;
    }
    notes.push(...placed.map(({ note }) => note));
  }
  const source: Notation = {
    title, bars, notes, rests, clefs, keySignatures, timeSignatures, graces,
    tempos: [], tempoMarks: [], pedalMoves: [], pedalMarks: [], octaveShifts: [],
    dynamics: [], dynamicLevels: [], words: [], hairpins: [],
  };
  const curved = applyMuseScoreCurves(directionBars, source);
  const withGraceSlurs = [...curved.notes];
  for (const group of graces) {
    if (group.leadsTo === null || !group.notes.some((n) => n.slur)) continue;
    const target = withGraceSlurs[group.leadsTo]!;
    withGraceSlurs[group.leadsTo] = { ...target, slurs: [{ type: 'stop', number: 1, placement: null }, ...target.slurs] };
  }
  const notation = applyMuseScoreDirections({ ...curved, notes: withGraceSlurs }, directionBars);
  return { ...notation, words: [...notation.words, ...fades] };
}
