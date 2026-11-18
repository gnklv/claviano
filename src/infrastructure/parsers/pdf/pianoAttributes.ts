import { signatureFifths } from './pianoKey';
import type { Notation } from '../../../domain/notation/notation';
import type { Clef } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import {
  BASS, TREBLE, codePoint, isAccidental, isHead, sortedX, timeOf, top, within, type Measure, type Staff,
} from './pianoGeometry';

const SMALL_TREBLE = 0xe07a;
const SMALL_BASS = 0xe07c;
const METRONOME_QUARTER = 0xeca5;

function isRhythm(glyph: PdfGlyph): boolean {
  const code = codePoint(glyph);
  return isHead(glyph) || (code >= 0xe4e3 && code <= 0xe4e8);
}

function isTimeDigit(glyph: PdfGlyph): boolean {
  const code = codePoint(glyph);
  return code >= 0xe080 && code <= 0xe089;
}

function fullClef(glyph: PdfGlyph): boolean {
  return [TREBLE, BASS].includes(codePoint(glyph));
}

function smallClef(glyph: PdfGlyph): boolean {
  return [SMALL_TREBLE, SMALL_BASS, 0xe053, 0xe064].includes(codePoint(glyph));
}

function clefOf(glyph: PdfGlyph): Clef {
  return [TREBLE, SMALL_TREBLE, 0xe053].includes(codePoint(glyph)) ? 'treble' : 'bass';
}

function clefPosition(glyph: PdfGlyph, staff: Staff): boolean {
  const line = clefOf(glyph) === 'treble' ? 1 : 3;
  return within(glyph.size, staff.space * 4, staff.space * 0.2)
    && within(glyph.y, staff.bottom + line * staff.space, staff.space * 0.15);
}

function glyphsOnStaff(glyphs: readonly PdfGlyph[], measure: Measure, index: number): PdfGlyph[] {
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  return glyphs.filter(g => (g.y > middle) === (index === 0));
}

// Bravura's small clef at the right barline announces the clef used from the next bar.
function endingClefs(glyphs: readonly PdfGlyph[], measure: Measure, index: number): PdfGlyph[] | null {
  const staff = measure.staves[index]!;
  const symbols = glyphsOnStaff(glyphs, measure, index);
  const cues = symbols.filter(smallClef);
  if (!cues.length) return cues;
  const [cue] = cues;
  if (cues.length !== 1 || !cue || !clefPosition(cue, staff)
    || measure.right - cue.x > staff.space * 3.6
    || symbols.some(g => isRhythm(g) && g.x >= cue.x)) return null;
  return cues;
}

function aligned(upper: PdfGlyph[], lower: PdfGlyph[], space: number): boolean {
  return upper.length === lower.length && upper.every((g, i) =>
    codePoint(g) === codePoint(lower[i]!) && within(g.x, lower[i]!.x, space * 0.2));
}

function readMeter(digits: PdfGlyph[], staff: Staff): ReturnType<typeof timeOf> {
  if (digits.some(g => !within(g.size, staff.space * 4, staff.space * 0.2)
    || ![1, 3].some(line => within(g.y, staff.bottom + line * staff.space, staff.space * 0.15)))) return null;
  const upper = digits.filter(g => g.y > staff.bottom + staff.space * 2);
  const lower = digits.filter(g => g.y < staff.bottom + staff.space * 2);
  if (!upper.length || !lower.length || !within(upper[0]!.x, lower[0]!.x, staff.space * 0.8)) return null;
  return timeOf(digits, staff);
}

function readTempo(glyphs: readonly PdfGlyph[], measure: Measure, first: number, beat: number, bar: number) {
  const staff = measure.staves[0];
  const space = staff.space;
  const units = glyphs.filter(g => codePoint(g) === METRONOME_QUARTER && g.x > measure.left
    && g.x < measure.right && g.y > top(staff) && g.y < top(staff) + space * 6);
  if (!units.length) return { glyphs: [] };
  const unit = units[0]!;
  if (units.length > 1 || unit.x > first + space || first - unit.x > space * 4
    || !within(unit.size, space * 4, space * 0.2)) return null;
  const run = sortedX(glyphs.filter(g => g.x > unit.x && g.x < measure.right && g.x < unit.x + space * 10
    && within(g.y, unit.y, space * 0.08)));
  const match = /^(\uECB7)?=(\d{1,3})$/u.exec(run.map(g => g.text).join('').replace(/\s/g, ''));
  const perMinute = Number(match?.[2]);
  if (!perMinute) return null;
  const dots = match?.[1] ? 1 as const : 0 as const;
  const mark: Notation['tempoMarks'][number] = { beat, unit: { value: 'quarter', dots }, perMinute, printed: true };
  const change: Notation['tempos'][number] = { bar, beat, bpm: perMinute * (dots ? 1.5 : 1) };
  return { glyphs: [unit, ...run], mark, change };
}

interface BarAttributes {
  readonly glyphs: PdfGlyph[];
  readonly readText: Set<PdfGlyph>;
  readonly time: Notation['timeSignatures'][number];
  readonly fifths: number;
  readonly clefs: readonly [Clef, Clef];
  readonly changes: Pick<Notation, 'clefs' | 'keySignatures' | 'timeSignatures' | 'tempos' | 'tempoMarks'>;
}

export function readBarAttributes(geometry: PdfGeometry, measure: Measure, printed: PdfGlyph[],
  preview: BarAttributes['changes'] & Pick<Notation, 'bars'>,
  newSystem: boolean, previousMeasure?: Measure, nextMeasure?: Measure, previousPage = geometry): BarAttributes | null {
  const lastBar = preview.bars.at(-1)!;
  const beat = lastBar.start + lastBar.length;
  const currentTime = preview.timeSignatures.at(-1)!;
  const currentKey = preview.keySignatures.at(-1)!;
  const clefs: [Clef, Clef] = ['treble', 'bass'];
  const clefChanges = [...preview.clefs];
  const header = new Set<PdfGlyph>();
  const previousGlyphs = previousMeasure ? previousPage.glyphs.filter(g => g.x > previousMeasure.left
    && g.x < previousMeasure.right && g.y > previousMeasure.staves[1].bottom - previousMeasure.staves[1].space * 5
    && g.y < top(previousMeasure.staves[0]) + previousMeasure.staves[0].space * 6) : [];
  let first = Infinity;
  let fifths = currentKey.fifths;
  let time = currentTime;
  let upperDigits: PdfGlyph[] = [];
  let upperMarks: PdfGlyph[] = [];

  for (const [i, staff] of measure.staves.entries()) {
    const symbols = glyphsOnStaff(printed, measure, i);
    const firstRhythm = symbols.find(isRhythm);
    if (!firstRhythm) return null;
    first = Math.min(first, firstRhythm.x);
    const outgoing = endingClefs(printed, measure, i);
    if (!outgoing || (outgoing.length && !nextMeasure)) return null;
    for (const cue of outgoing) header.add(cue);

    const signs = symbols.filter(fullClef);
    if (signs.length !== (newSystem ? 1 : 0)) return null;
    const sign = signs[0];
    if (sign && (!clefPosition(sign, staff) || sign.x >= firstRhythm.x
      || sign.x - measure.left > staff.space * 2)) return null;
    if (sign) header.add(sign);
    const incoming = previousMeasure ? endingClefs(previousGlyphs, previousMeasure, i) : [];
    if (!incoming) return null;
    const cue = incoming[0];
    if (cue && sign && clefOf(cue) !== clefOf(sign)) return null;
    const current = preview.clefs.filter(change => change.staff === i + 1).at(-1);
    const currentClef = current?.clef;
    if (!currentClef) return null;
    const clef = sign ? clefOf(sign) : cue ? clefOf(cue) : currentClef;
    clefs[i] = clef;
    const symbol = cue ?? sign;
    const octaves = symbol ? ({ [0xe053]: 1, [0xe064]: -1 }[codePoint(symbol)] ?? 0) : current?.octaves ?? 0;
    if (clef !== currentClef || octaves !== (current?.octaves ?? 0))
      clefChanges.push({ staff: i + 1, beat, clef, ...(octaves ? { octaves } : {}) });

    const digits = symbols.filter(isTimeDigit);
    const firstDigit = digits[0]?.x ?? firstRhythm.x;
    if (digits.some(g => g.x >= firstRhythm.x || (sign && g.x <= sign.x))
      || (i > 0 && !aligned(upperDigits, digits, staff.space))) return null;
    upperDigits = digits;
    const meter = digits.length ? readMeter(digits, staff) : currentTime;
    if (!meter || (i > 0 && (meter.numerator !== time.numerator || meter.denominator !== time.denominator))) return null;
    time = meter;
    for (const digit of digits) header.add(digit);

    const keyMarks = symbols.filter(g => isAccidental(g) && g.x < firstDigit
      && (digits.length || newSystem || firstRhythm.x - g.x >= staff.space * 2));
    if (newSystem && !keyMarks.length && currentKey.fifths !== 0) return null;
    const key = keyMarks.length ? signatureFifths(keyMarks, currentKey.fifths, staff, clef) : currentKey.fifths;
    if (key === null || (i > 0 && (key !== fifths || !aligned(upperMarks, keyMarks, staff.space)))
      || keyMarks.some(g => (sign && g.x <= sign.x) || (!digits.length && firstRhythm.x - g.x < staff.space * 2)
        || !within(g.size, staff.space * 4, staff.space * 0.2))) return null;
    upperMarks = keyMarks;
    fifths = key;
    for (const mark of keyMarks) header.add(mark);
  }

  const tempo = readTempo(geometry.glyphs, measure, first, beat, preview.bars.length);
  if (!tempo) return null;
  for (const glyph of tempo.glyphs) header.add(glyph);
  return {
    glyphs: printed.filter(g => !header.has(g)),
    readText: new Set(tempo.glyphs),
    time,
    fifths,
    clefs,
    changes: {
      clefs: clefChanges,
      keySignatures: fifths === currentKey.fifths ? preview.keySignatures
        : [...preview.keySignatures, { beat, fifths, minor: false }],
      timeSignatures: time.numerator === currentTime.numerator && time.denominator === currentTime.denominator
        ? preview.timeSignatures : [...preview.timeSignatures, { ...time, beat }],
      tempos: tempo.change ? [...preview.tempos, tempo.change] : preview.tempos,
      tempoMarks: tempo.mark ? [...preview.tempoMarks, tempo.mark] : preview.tempoMarks,
    },
  };
}
