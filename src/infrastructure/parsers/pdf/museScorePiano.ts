import { writtenDuration } from '../../../domain/notation/noteValue';
import type { Notation } from '../../../domain/notation/notation';
import { keyAlteration, midiOf, type Alteration } from '../../../domain/notation/spelling';
import type { Clef, WrittenRest } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { museScoreAttacks, type MuseScoreAttack } from './museScoreAttacks';
import { museScoreNoteMarks } from './museScoreNoteMarks';
import { applyMuseScoreCurves } from './museScoreCurves';
import { museScoreKey } from './pianoKey';
import { museScoreMeasures } from './museScoreMeasures';
import { ACCIDENTALS, BASS, FLAT, TREBLE, center, codePoint, isAccidental, isHead, pitchAt, strips, timeOf, within, type BeamStrip, type Measure, type Staff } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';
import type { PdfPianoPreview } from './pianoPickup';

export interface MuseScoreBar {
  geometry: PdfGeometry;
  measure: Measure;
  notes: TimedNote[];
  columns: { x: number; beat: number }[];
  index: number;
}

function staffDistance(glyph: PdfGlyph, staff: Staff): number {
  const halfSpaces = (glyph.y - staff.bottom) * 2 / staff.space;
  const rounding = Math.abs(halfSpaces - Math.round(halfSpaces));
  return Math.abs(glyph.y - center(staff)) / staff.space + (rounding > 0.025 ? 20 : 0);
}

/** Assign ledger-line heads by staff grid. Where both grids coincide between
 * staves, the stem points back to the staff containing the rest of its chord. */
function owningStaff(glyph: PdfGlyph, candidates: Staff[], geometry: PdfGeometry): Staff {
  const owner = candidates.reduce((best, staff) =>
    staffDistance(glyph, staff) < staffDistance(glyph, best) ? staff : best);
  if (!isHead(glyph)) return owner;
  const alternate = candidates.find(staff => staff !== owner
    && staffDistance(glyph, staff) - staffDistance(glyph, owner) < 1.5);
  if (!alternate) return owner;
  const space = owner.space;
  const stem = geometry.segments.find(line =>
    within(line.x1, line.x2, 0.02) && Math.abs(line.y1 - line.y2) > space * 2
    && [0.055, 1.24].some(offset => within(line.x1 - glyph.x, offset * space, space * 0.1))
    && [line.y1, line.y2].some(y => within(y, glyph.y, space * 0.2)));
  if (!stem) return owner;
  const middle = (stem.y1 + stem.y2) / 2;
  return Math.abs(middle - center(owner)) < Math.abs(middle - center(alternate)) ? owner : alternate;
}

/** Concurrent voices start together. The next printed column belongs to the
 * voice whose preceding value finishes first. A shared head carries both attacks. */
function timeAttacks(attacks: MuseScoreAttack[], space: number, length: number) {
  const clocks: number[] = [0];
  const timed: { attack: MuseScoreAttack; beat: number; voice: number }[] = [];
  for (let i = 0; i < attacks.length;) {
    const first = attacks[i]!;
    let end = i + 1;
    while (end < attacks.length && within(first.x, attacks[end]!.x, space * 0.17)) end++;
    const column = attacks.slice(i, end).sort((a, b) => a.beats - b.beats);
    if (column.length > 1 && !column.some(attack => attack.hiddenHead)) {
      column.sort((a, b) => Number(b.stem?.up ?? false) - Number(a.stem?.up ?? false));
    }
    const beat = Math.min(...clocks);
    const available = clocks.flatMap((value, index) => value === beat ? [index] : []);
    for (const attack of column) {
      const voice = available.shift() ?? clocks.length;
      clocks[voice] = beat + attack.beats;
      timed.push({ attack, beat, voice });
    }
    i = end;
  }
  if (clocks.every(c => c === length)) return timed;
  // MuseScore omits invisible rests from the PDF. In a regular beamed
  // subdivision, an independently stemmed sustained attack can occupy the
  // column of that rest. Accept it only if the inferred grid fills the bar.
  const step = Math.min(...attacks.map(a => a.beats));
  const regular = attacks.every(a => a.beats === step || a.beats > step && !a.beams.length);
  if (regular && attacks.length * step === length && attacks.some(a => a.beams.length)) {
    const layered = attacks.map((attack, i) => ({ attack, beat: i * step, voice: attack.beats > step ? 1 : 0 }));
    if (layered.every((t, i) => t.voice === 0 || t.beat + t.attack.beats <= (layered.slice(i + 1).find(n => n.voice === 1)?.beat ?? length))) {
      return layered;
    }
  }
  return null;
}

interface StaffState {
  current: Clef[];
  clefs: Notation['clefs'][number][];
  rests: WrittenRest[];
}

function readStaff(
  positioned: MuseScoreBar, j: number, glyphs: PdfGlyph[], beams: BeamStrip[],
  start: number, length: number, key: number, state: StaffState,
): boolean {
  const staff = positioned.measure.staves[j]!;
  const space = staff.space;
  const geometry = positioned.geometry;
  const clefMarks = glyphs.filter(g => [TREBLE, BASS].includes(codePoint(g))).sort((a, b) => a.x - b.x);
  const change = (mark: PdfGlyph, beat: number) => {
    const clef = codePoint(mark) === TREBLE ? 'treble' : 'bass';
    if (state.current[j] !== clef || mark.size < space * 3.5) {
      state.current[j] = clef;
      state.clefs.push({ staff: j + 1, beat, clef });
    }
  };
  const attacks = museScoreAttacks(geometry, glyphs, staff, beams, length);
  if (!attacks) return false;
  const timed = timeAttacks(attacks, space, length);
  if (!timed) return false;
  const accidentals = new Map<number, Alteration>();
  const heads = glyphs.filter(isHead);
  for (const { attack, beat: offset, voice } of timed) {
    const beat = start + offset;
    while (clefMarks[0] && clefMarks[0].x < attack.x) change(clefMarks.shift()!, beat);
    const clef = state.current[j]!;
    const voiceNumber = String(voice + 1 + 4 * j);
    positioned.columns.push({ x: attack.x, beat });
    if (attack.rest) {
      const wholeBar = attack.duration.value === 'whole' && !heads.length;
      state.rests.push({ staff: j + 1, voice: voiceNumber, beat, clef, displayPitch: null,
        measure: wholeBar, duration: wholeBar ? writtenDuration(length) : attack.duration });
    }
    const chord = [...attack.heads].sort((a, b) => a.y - b.y);
    for (const [member, head] of chord.entries()) {
      const position = pitchAt(head.y, staff, clef);
      if (!position) return false;
      const degree = position.octave * 7 + position.letter;
      const mark = glyphs.filter(g => isAccidental(g) && within(g.y, head.y, space * 0.08) && g.x < head.x && head.x - g.x < space * 2.2)
        .sort((a, b) => b.x - a.x)[0];
      const accidental = mark && ACCIDENTALS[codePoint(mark) - FLAT];
      if (accidental) accidentals.set(degree, accidental[1]);
      const pitch = { ...position, alteration: accidentals.get(degree) ?? keyAlteration(position.letter, key) };
      const shared = attacks.some(other => other.hiddenHead === head && other !== attack);
      positioned.notes.push({
        x: head.x, y: head.y, columnX: attack.x, note: {
          bar: positioned.index, staff: j + 1, voice: voiceNumber, hand: j ? 'left' : 'right',
          chord: member > 0, clef, pitch, sounding: midiOf(pitch), beat, beats: attack.beats, duration: attack.duration,
          tuplet: attack.tremolo ? { actual: 2, normal: 1 } : null, tupletStart: null, tupletStop: false,
          accidental: !shared && accidental ? accidental[0] : null,
          stem: attack.stem ? (attack.stem.up ? 'up' : 'down') : null,
          beams: member === 0 ? attack.beams : [], tieStart: false, tieStop: false,
          articulations: [], fermata: null, slurs: [], dynamics: null, ornaments: [], trillLine: false,
          tremolo: member === 0 ? attack.tremolo ?? null : null, arpeggio: null, ...(attack.hiddenHead === head ? { headless: true } : {}),
        }
      });
    }
  }
  for (const mark of clefMarks) change(mark, start + length);
  return true;
}

export function readMuseScorePiano(pages: readonly PdfGeometry[], opening: Notation,
  decorate?: (notation: Notation, bars: readonly MuseScoreBar[]) => Notation, limit = Infinity): PdfPianoPreview | null {
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
  const current: Clef[] = [clefs.find(c => c.staff === 1)?.clef ?? 'treble', clefs.find(c => c.staff === 2)?.clef ?? 'bass'];
  const state = { current, clefs, rests };
  if (!pages.length) return null;
  for (const geometry of pages) {
    if (bars.length === limit) break;
    const measures = museScoreMeasures(geometry);
    const first = measures[0];
    if (!first) return null;
    const beams = strips(geometry.fills, first.staves[0].space);
    for (const measure of measures) {
      if (bars.length === limit) break;
      const index = bars.length;
      if (measure.printedNumber !== undefined && measure.printedNumber !== index + 1) return null;
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
      const signature = museScoreKey(staffGlyphs, measure, current, key);
      if (!signature) return null;
      if (signature.fifths !== key) {
        key = signature.fifths;
        keySignatures.push({ beat: start, fifths: key, minor: false });
      }
      const printedTime = timeOf(staffGlyphs[0], measure.staves[0]);
      if (printedTime && (time.numerator !== printedTime.numerator || time.denominator !== printedTime.denominator)) {
        time = { ...printedTime, beat: start };
        signatures.push(time);
      }
      const length = time.numerator * 4 / time.denominator;
      const positioned: MuseScoreBar = { index, geometry, measure, notes: [], columns: [] };
      for (const [j, glyphs] of staffGlyphs.entries()) {
        if (!readStaff(positioned, j, glyphs.filter(g => !signature.marks[j]!.includes(g)), beams, start, length, key, state)) return null;
      }
      positioned.notes = museScoreNoteMarks(inBar, positioned.notes, space);
      bars.push({ start, length, navigation: {} });
      positions.push(positioned);
      start += length;
    }
  }
  const notation = { ...opening, bars, notes: positions.flatMap(p => p.notes.map(n => n.note)), rests, clefs, keySignatures, timeSignatures: signatures };
  const curved = applyMuseScoreCurves(positions, notation);
  return { notation: decorate ? decorate(curved, positions) : curved, issues: [] };
}
