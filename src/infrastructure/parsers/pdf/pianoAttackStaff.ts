import { writtenDuration } from '../../../domain/notation/noteValue';
import { keyAlteration, midiOf, type Alteration } from '../../../domain/notation/spelling';
import type { Clef, ClefChange, WrittenRest } from '../../../domain/notation/written';
import type { PdfGlyph } from './geometry';
import type { TimedAttack } from './pianoAttackTiming';
import { ACCIDENTALS, FLAT, codePoint, isAccidental, isHead, pitchAt, printedClef, top, within, type Staff } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

interface TimedStaff {
  barIndex: number;
  staffIndex: number;
  staff: Staff;
  glyphs: readonly PdfGlyph[];
  timed: readonly TimedAttack[];
  graceGlyphs?: readonly PdfGlyph[];
  start: number;
  length: number;
  key: number;
  crossStaff?: { lowerStaff: Staff; pairedRests: readonly TimedAttack[] };
}

interface StaffNotation {
  current: Clef[];
  octaves: number[];
  clefs: ClefChange[];
  notes: TimedNote[];
  rests: WrittenRest[];
  columns?: { x: number; beat: number; rest?: { staff: number; beats: number } }[];
}

export function readAttackStaff(
  { barIndex, staffIndex: j, staff, glyphs, timed, start, length, key, crossStaff, graceGlyphs = [] }: TimedStaff,
  output: StaffNotation,
): boolean {
  const space = staff.space;
  const clefMarks = glyphs.filter(g => printedClef(codePoint(g))).sort((a, b) => a.x - b.x);
  const change = (mark: PdfGlyph, beat: number) => {
    const { clef, octaves = 0 } = printedClef(codePoint(mark))!;
    if (output.current[j] !== clef || output.octaves[j] !== octaves || mark.size < space * 3.5) {
      output.current[j] = clef;
      output.octaves[j] = octaves;
      output.clefs.push({ staff: j + 1, beat, clef, ...(octaves ? { octaves } : {}) });
    }
  };
  const accidentals = new Map<number, Alteration>();
  const heads = glyphs.filter(isHead);
  const graceMarks = graceGlyphs.filter(isAccidental).sort((a, b) => a.x - b.x);
  const layered = timed.some(item => item.voice === 0) && timed.some(item => item.voice > 0);
  for (const { attack, beat: offset, voice } of timed) {
    const beat = start + offset;
    while (clefMarks[0] && clefMarks[0].x < attack.x) change(clefMarks.shift()!, beat);
    const clef = output.current[j]!;
    while (graceMarks[0] && graceMarks[0].x < attack.x) {
      const mark = graceMarks.shift()!;
      const position = pitchAt(mark.y, staff, clef);
      const alteration = ACCIDENTALS[codePoint(mark) - FLAT];
      if (!position || !alteration) return false;
      accidentals.set(position.octave * 7 + position.letter, alteration[1]);
    }
    const voiceNumber = String(crossStaff ? voice + (voice === 0 ? 1 : 4) : voice + 1 + 4 * j);
    if (attack.rest) {
      const wholeBar = attack.duration.value === 'whole' && !heads.length;
      output.columns?.push({ x: attack.x, beat, rest: { staff: j + 1, beats: wholeBar ? length : attack.beats } });
      // A displaced eighth-rest glyph uses the middle line as its pitch
      // baseline. The automatic upper voice baseline is the top line.
      const raisedEighth = layered && voice === 0 && attack.duration.value === 'eighth'
        && attack.rest.y > top(staff) + space * 0.25
        ? pitchAt(attack.rest.y - space * 2, staff, clef) : null;
      const loweredEighth = voice > 0 && attack.duration.value === 'eighth'
        && within(attack.rest.y, staff.bottom, space * 0.05) ? pitchAt(attack.rest.y + space, staff, clef) : null;
      const display = crossStaff?.pairedRests.some(item => item.attack === attack)
        ? pitchAt(staff.bottom + attack.rest.y - crossStaff.lowerStaff.bottom, staff, clef)
        : raisedEighth ?? loweredEighth;
      output.rests.push({ staff: j + 1, voice: voiceNumber, beat, clef, displayPitch: display,
        measure: wholeBar, ...(attack.tupletPart ? {
          tuplet: attack.tupletRatio!,
          tupletStart: attack.tupletPart === 'start' ? { showNumber: true, bracket: attack.tupletBracket ?? false } : null,
          tupletStop: attack.tupletPart === 'stop' } : {}),
        duration: wholeBar ? writtenDuration(length) : attack.duration });
    } else output.columns?.push({ x: attack.x, beat });
    const chord = [...attack.heads].sort((a, b) => a.y - b.y);
    // Seconds and thirds can require several staggered accidental columns.
    // Allow another column only when the chord has at least three members.
    const accidentalReach = chord.length >= 3 ? 5.2 : chord.length === 2 ? 4 : 2.2;
    for (const [member, head] of chord.entries()) {
      const position = pitchAt(head.y, staff, clef);
      if (!position) return false;
      const degree = position.octave * 7 + position.letter;
      const mark = glyphs.filter(g => isAccidental(g) && within(g.y, head.y, space * 0.08) && g.x < head.x && head.x - g.x < space * accidentalReach
        && !heads.some(other => other.x > g.x && other.x < head.x - space * 1.4))
        .sort((a, b) => b.x - a.x)[0];
      const accidental = mark && ACCIDENTALS[codePoint(mark) - FLAT];
      if (accidental) accidentals.set(degree, accidental[1]);
      const pitch = { ...position, alteration: accidentals.get(degree) ?? keyAlteration(position.letter, key) };
      const shared = timed.some(other => other.attack.hiddenHead === head && other.attack !== attack);
      output.notes.push({
        x: head.x, y: head.y, columnX: attack.x, note: {
          bar: barIndex, staff: j + 1, voice: voiceNumber, hand: j ? 'left' : 'right',
          chord: member > 0, clef, pitch, sounding: midiOf(pitch) + 12 * output.octaves[j]!, beat, beats: attack.beats, duration: attack.duration,
          tuplet: attack.tupletRatio ?? (attack.tremolo ? { actual: 2, normal: 1 } : null),
          tupletStart: !member && attack.tupletPart === 'start' ? { showNumber: true, bracket: attack.tupletBracket ?? false } : null,
          tupletStop: !member && attack.tupletPart === 'stop',
          accidental: !shared && accidental ? accidental[0] : null,
          stem: attack.stem ? (attack.stem.up ? 'up' : 'down') : null,
          beams: member === 0 ? attack.beams : [], tieStart: false, tieStop: false,
          articulations: [], fermata: null, slurs: [], dynamics: null, ornaments: [], trillLine: false,
          ...(within(head.size, space * 2.8, space * 0.08)
            ? { small: true } : {}),
          tremolo: member === 0 ? attack.tremolo ?? null : null, arpeggio: null, ...(attack.hiddenHead === head ? { headless: true } : {}),
        }
      });
    }
  }
  for (const mark of clefMarks) change(mark, timed.length ? start + length : start);
  return true;
}
