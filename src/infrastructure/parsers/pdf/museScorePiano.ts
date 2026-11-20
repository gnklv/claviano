import { timeAttacks, type TimedAttack, type AttackTiming } from './pianoAttackTiming';
import type { Notation } from '../../../domain/notation/notation';
import { readAttackStaff } from './pianoAttackStaff';
import type { Clef, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { attachedBeams, readPianoAttacks, type PianoAttack } from './pianoAttacks';
import { readPianoNoteMarks } from './pianoNoteMarks';
import { applyMuseScoreCurves } from './museScoreCurves';
import type { MuseScoreDirectionBar } from './museScoreDirections';
import { museScoreKey } from './pianoKey';
import { museScoreMeasures } from './museScoreMeasures';
import { center, codePoint, owningStaff, strips, timeOf, within, type BeamStrip, type Measure } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';
import type { PdfPianoPreview } from './pianoReading';

export interface MuseScoreBar {
  geometry: PdfGeometry;
  measure: Measure;
  notes: TimedNote[];
  columns: NonNullable<MuseScoreDirectionBar['columns']>[number][];
  index: number;
}

function crossStaffBeams(upper: PianoAttack[], lower: PianoAttack[], beams: BeamStrip[], space: number) {
  return beams.flatMap(beam => {
    const touches = ({ stem, beams: marks }: PianoAttack) => stem && marks.length
      && stem.x >= beam.left - space * 0.1 && stem.x <= beam.right + space * 0.1
      && within(stem.far, beam.yAt(stem.x), space * 0.4);
    const above = upper.filter(touches);
    const below = lower.filter(touches);
    return above.length && below.length ? [[...above, ...below]] : [];
  });
}

export function readMuseScorePiano(pages: readonly PdfGeometry[], opening: Notation,
  decorate?: (notation: Notation, bars: readonly MuseScoreBar[]) => Notation, limit = Infinity, completeDocument = true): PdfPianoPreview | null {
  const bars: Notation['bars'][number][] = [];
  const rests: WrittenRest[] = [];
  const positions: MuseScoreBar[] = [];
  const clefs = [...opening.clefs];
  const signatures = [...opening.timeSignatures];
  const keySignatures = opening.keySignatures.filter(change => change.beat === 0);
  let key = keySignatures[0]?.fifths ?? 0;
  let time = signatures[0];
  if (!time) return null;
  let start = 0;
  let pickupLength = 0;
  let pickupNumberOffset: number | undefined;
  let precedingCrossStaffBeam = false;
  const current: Clef[] = [clefs.find(c => c.staff === 1)?.clef ?? 'treble', clefs.find(c => c.staff === 2)?.clef ?? 'bass'];
  const state = { current, octaves: [1, 2].map(staff => clefs.find(c => c.staff === staff)?.octaves ?? 0), clefs, rests };
  if (!pages.length) return null;
  for (const geometry of pages) {
    if (bars.length === limit) break;
    const measures = museScoreMeasures(geometry);
    const first = measures[0];
    if (!first) return null;
    const beams = strips(geometry.fills, first.staves[0].space, 1);
    for (const measure of measures) {
      if (bars.length === limit) break;
      const index = bars.length;
      if (measure.printedNumber !== undefined) {
        const offset = index + 1 - measure.printedNumber;
        if (index > 0 && pickupLength > 0) {
          // Editions can count the pickup as measure one or omit it from numbering.
          if (offset !== 0 && offset !== 1) return null;
          pickupNumberOffset ??= offset;
          if (offset !== pickupNumberOffset) return null;
        } else if (offset !== 0) return null;
      }
      const space = measure.staves[0].space;
      const nearby = measures.filter(other => other.left < measure.right && other.right > measure.left);
      const inBar = geometry.glyphs.filter(glyph => glyph.x > measure.left && glyph.x < measure.right);
      const staffGlyphs: [PdfGlyph[], PdfGlyph[]] = [[], []];
      for (const glyph of inBar) {
        if (measure.staves.every(staff => Math.abs(glyph.y - center(staff)) > space * 14)) continue;
        const candidates = nearby.filter(other => other.left < glyph.x && glyph.x < other.right).flatMap(other => other.staves);
        const owner = owningStaff(glyph, candidates, geometry);
        if (owner === measure.staves[0]) staffGlyphs[0].push(glyph);
        if (owner === measure.staves[1]) staffGlyphs[1].push(glyph);
      }
      const signature = museScoreKey(staffGlyphs, measure, current, key, measure.systemStart);
      if (!signature) return null;
      if (signature.fifths !== key) {
        key = signature.fifths;
        keySignatures.push({ beat: start, fifths: key, minor: false });
      }
      const upperStaff = measure.staves[0];
      const printedTime = timeOf(inBar.filter(g => within(g.y, center(upperStaff), space * 1.25)
        && within(g.size, space * 4, space * 0.3)), upperStaff);
      if (printedTime && (time.numerator !== printedTime.numerator || time.denominator !== printedTime.denominator)) {
        time = { ...printedTime, beat: start };
        signatures.push(time);
      }
      const nominalLength = time.numerator * 4 / time.denominator;
      const positioned: MuseScoreBar = { index, geometry, measure, notes: [], columns: [] };
      const rows = staffGlyphs.map((glyphs, j) => glyphs.filter(g => !signature.marks[j]!.includes(g)));
      const attacks = rows.map((glyphs, j) => readPianoAttacks(geometry, glyphs, measure.staves[j]!, beams, nominalLength));
      const [upper, lower] = attacks;
      if (!upper || !lower || rows.some((row, j) => !attacks[j]!.length && row.some(g => {
        const code = codePoint(g);
        return code >= 0xe0a0 && code <= 0xe0af || code >= 0xe4e3 && code <= 0xe4ef;
      }))) return null;
      const joined = crossStaffBeams(upper, lower, beams, space);
      const closing = completeDocument && geometry === pages.at(-1) && measure === measures.at(-1) && pickupLength > 0;
      const separate = [upper, lower].map(staff => {
        const lone = staff.length === 1 ? staff[0] : undefined;
        // A centered measure rest follows the bar length supplied by the other staff.
        if (lone?.rest && lone.duration.value === 'whole' && lone.duration.dots === 0) {
          return { timed: [{ attack: lone, beat: 0, voice: 0 }], length: 0 };
        }
        return staff.length ? timeAttacks(staff, space, nominalLength, index === 0 || closing)
          : { timed: [], length: 0 };
      });
      // A voice can finish its cross-staff phrase in the next bar without
      // another shared beam. Require complete clocks across the two staves.
      const together: AttackTiming | null = joined.length || precedingCrossStaffBeam && separate.some(timing => !timing)
        ? timeAttacks([...upper, ...lower].sort((a, b) => a.x - b.x), space, nominalLength, false)
        : null;
      const crossed: boolean = !!together && joined.every(group =>
        new Set(together.timed.filter(item => group.includes(item.attack)).map(item => item.voice)).size === 1);
      if (crossed) {
        for (const group of joined) {
          const stems = group.map(attack => attack.stem!);
          for (const attack of group) {
            const marks = attachedBeams(attack.stem!, beams, stems, space);
            if (marks.length === attack.beams.length) attack.beams = marks;
          }
        }
      }
      const lowerRests = crossed && together
        ? together.timed.filter(item => item.attack.rest && lower.includes(item.attack))
        : [];
      const pairedRests = lowerRests.filter(item => item.voice <= 1 && lowerRests.some(other =>
        other.voice === 1 - item.voice && within(item.beat, other.beat, 1e-8)));
      const crossedStaff = (item: TimedAttack) =>
        upper.includes(item.attack) || item.voice === 0 && pairedRests.includes(item) ? 0 : 1;
      const timings = crossed && together
        ? [0, 1].map(staff => ({ timed: together.timed.filter(item => crossedStaff(item) === staff), length: nominalLength }))
        : separate;
      precedingCrossStaffBeam = crossed && joined.length > 0;
      const length = timings.find(timing => timing?.length)?.length
        ?? (timings.some(timing => timing?.timed.length) ? nominalLength : 0);
      if (!length || timings.some(timing => !timing || timing.length > 0 && !within(timing.length, length, 1e-8))) return null;
      if (length < nominalLength - 1e-8) {
        if (index === 0) pickupLength = length;
        else if (!closing || !within(length + pickupLength, nominalLength, 1e-8)) return null;
      }
      for (const [j, row] of rows.entries()) {
        if (!readAttackStaff({
          barIndex: index, staffIndex: j, staff: measure.staves[j]!, glyphs: row,
          timed: timings[j]!.timed, start, length, key,
          crossStaff: crossed ? { lowerStaff: measure.staves[1], pairedRests } : undefined,
        }, { ...state, notes: positioned.notes, columns: positioned.columns })) return null;
      }
      positioned.notes = readPianoNoteMarks(inBar, positioned.notes, space);
      bars.push({ start, length, navigation: {} });
      positions.push(positioned);
      start += length;
    }
  }
  const notation = { ...opening, bars, notes: positions.flatMap(p => p.notes.map(n => n.note)), rests, clefs, keySignatures, timeSignatures: signatures };
  const curved = applyMuseScoreCurves(positions, notation);
  return { notation: decorate ? decorate(curved, positions) : curved, issues: [] };
}
