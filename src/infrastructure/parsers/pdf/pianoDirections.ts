import { softPedalWords } from '../../../domain/pedal';
import type { Notation, WrittenBar } from '../../../domain/notation/notation';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { readPedalLines, type UnresolvedPedal } from './pianoPedalLines';
import { PEDAL, PIANO, codePoint, isHead, sortedX, top, within, type Measure } from './pianoGeometry';

const FORTE = 0xe522;
const PEDAL_UP = 0xe655;

interface Column {
  readonly x: number;
  readonly beat: number;
}

/** Directions use the same font size as notes, but occupy their own lanes. */
export function isBarDirectionGlyph(glyph: PdfGlyph, measure: Measure): boolean {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  if (glyph.x <= measure.left || glyph.x >= measure.right
    || !within(glyph.size, space * 4, space * 0.2)) return false;
  switch (codePoint(glyph)) {
    case PIANO:
    case FORTE:
      return glyph.y < upper.bottom && glyph.y > top(lower);
    case PEDAL:
    case PEDAL_UP:
      return glyph.y < lower.bottom && glyph.y > lower.bottom - space * 5;
    default:
      return false;
  }
}

/** Recover printed levels and pedal signs when they align to the written timeline. */
export function readBarDirections(
  geometry: PdfGeometry,
  measure: Measure,
  bar: WrittenBar,
  columns: readonly Column[],
  barIndex: number,
): {
  dynamics: Notation['dynamics'];
  pedalMoves: Notation['pedalMoves'];
  pedalMarks: Notation['pedalMarks'];
  readText: PdfGlyph[];
  unresolvedPedals: UnresolvedPedal[];
  pedalContinues: boolean;
  pedalFromPrevious: boolean;
} | null {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const beatAt = (x: number): number | undefined => {
    const beats = new Set(columns.filter(column => within(column.x, x, space * 0.25)).map(column => column.beat));
    if (beats.size === 1) return beats.values().next().value;
  };
  const glyphs = sortedX(geometry.glyphs.filter(g => isBarDirectionGlyph(g, measure)));
  const dynamics: Notation['dynamics'][number][] = [];
  const pedalMoves: Notation['pedalMoves'][number][] = [];
  const pedalMarks: Notation['pedalMarks'][number][] = [];
  const readText: PdfGlyph[] = [];
  const rows = new Map<number, PdfGlyph[]>();
  for (const glyph of geometry.glyphs) {
    if (glyph.x <= measure.left || glyph.x >= measure.right || glyph.y <= top(lower)
      || glyph.y >= upper.bottom || !/Italic$/.test(glyph.font)) continue;
    const row = rows.get(glyph.y) ?? [];
    row.push(glyph);
    rows.set(glyph.y, row);
  }
  for (const row of rows.values()) {
    for (const run of textRuns(row, space)) {
      const text = run.map(glyph => glyph.text).join('').trim();
      const soft = softPedalWords(text);
      if (!soft) continue;
      const beat = beatAt(run[0]!.x);
      if (beat === undefined || pedalMoves.some(move => move.beat === beat)) return null;
      const down = soft === 'down';
      pedalMoves.push({ bar: barIndex, pedal: 'soft', beat, down });
      pedalMarks.push({ pedal: 'soft', beat, type: down ? 'start' : 'stop', sign: false, line: false, text });
      readText.push(...run);
    }
  }
  let pressed: { beat: number; y: number } | undefined;
  for (const glyph of glyphs) {
    const code = codePoint(glyph);
    const beat = beatAt(glyph.x);
    if (code === PIANO || code === FORTE) {
      if (beat === undefined || dynamics.some(mark => mark.beat === beat)) return null;
      dynamics.push({ beat, below: false, text: code === PIANO ? 'p' : 'f', letters: true });
      continue;
    }
    if (code === PEDAL) {
      if (pressed || beat === undefined) return null;
      pressed = { beat, y: glyph.y };
      continue;
    }
    // The engraved release star can stand immediately before the closing barline.
    const atBarline = measure.right - glyph.x <= space && columns.every(column => glyph.x - column.x > space * 0.25);
    const end = beat ?? (atBarline ? bar.start + bar.length : undefined);
    if (!pressed || end === undefined || end <= pressed.beat || !within(glyph.y, pressed.y, space * 0.25)) return null;
    pedalMoves.push({ bar: barIndex, pedal: 'sustain', beat: pressed.beat, down: true },
      { bar: barIndex, pedal: 'sustain', beat: end, down: false });
    pedalMarks.push({ pedal: 'sustain', beat: pressed.beat, type: 'start', sign: true, line: false },
      { pedal: 'sustain', beat: end, type: 'stop', sign: true, line: false });
    pressed = undefined;
  }
  if (pressed) return null;
  const lines = readPedalLines(geometry, measure, bar, barIndex, columns, beatAt,
    x => hasSostenutoHeading(geometry.glyphs, upper, x));
  if (!lines || (pedalMarks.some(mark => mark.pedal === 'sustain')
    && (lines.pedalMarks.length || lines.unresolvedPedals.length || lines.pedalContinues))) return null;
  pedalMarks.push(...lines.pedalMarks);
  pedalMoves.push(...lines.pedalMoves);
  return { dynamics, unresolvedPedals: lines.unresolvedPedals, pedalMoves: pedalMoves.sort((a, b) => a.beat - b.beat),
    pedalMarks: pedalMarks.sort((a, b) => a.beat - b.beat), readText, pedalContinues: lines.pedalContinues, pedalFromPrevious: lines.pedalFromPrevious };
}

export function textRuns(row: PdfGlyph[], space: number): PdfGlyph[][] {
  const runs: PdfGlyph[][] = [];
  for (const glyph of sortedX(row)) {
    const run = runs.at(-1);
    if (run && glyph.font === run[0]!.font && glyph.textObject === run[0]!.textObject && glyph.x - run.at(-1)!.x <= space * 2) run.push(glyph);
    else runs.push([glyph]);
  }
  return runs;
}

// An unsigned bracket and a sostenuto instruction do not uniquely identify
// the pedal. The instruction can also refer to how the passage is played.
function hasSostenutoHeading(glyphs: PdfGlyph[], upper: Measure['staves'][0], x: number): boolean {
  const space = upper.space;
  const rows = new Map<number, PdfGlyph[]>();
  for (const glyph of glyphs) {
    if (glyph.y <= top(upper) || glyph.y > top(upper) + space * 6 || !/Italic$|Bold$/.test(glyph.font)) continue;
    const row = rows.get(glyph.y) ?? [];
    row.push(glyph);
    rows.set(glyph.y, row);
  }
  return [...rows.values()].some(row => textRuns(row, space).some(run => {
    const first = run[0]!, last = run.at(-1)!;
    return /^sostenuto$/i.test(run.map(glyph => glyph.text).join('').trim())
      && (within(first.x, x, space * 0.25) || (last.x < x && within(last.x, x, space * 1.25)));
  }));
}

export function readBarWords(geometry: PdfGeometry, measure: Measure, next: Measure | undefined,
  printed: PdfGlyph[], start: number, beat: number, preview: Notation, readText: Set<PdfGlyph>,
): Notation['words'] | null {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const middle = (upper.bottom + top(lower)) / 2;
  // A right-aligned direction can begin in the preceding bar. Collect whole text
  // runs before comparing their endpoints to the first note column.
  const rows = new Map<number, PdfGlyph[]>();
  for (const g of geometry.glyphs) {
    if (!/(Italic|Bold)$/.test(g.font) || readText.has(g) || g.y <= top(upper) || g.y > top(upper) + space * 6) continue;
    const row = rows.get(g.y) ?? [];
    row.push(g);
    rows.set(g.y, row);
  }
  const nextStart = next && within(next.left, measure.right, 0.04)
    && within(next.staves[0].bottom, upper.bottom, 0.04)
    ? sortedX(geometry.glyphs.filter(g => g.x > next.left && g.x < next.right
      && g.y > lower.bottom - space * 5 && g.y < top(upper) + space * 6
      && (isHead(g) || (codePoint(g) >= 0xe4e4 && codePoint(g) <= 0xe4e8))))[0]?.x : undefined;
  const words = [...preview.words];
  for (const row of rows.values()) {
    for (const run of textRuns(row, space)) {
      const first = run[0]!, last = run.at(-1)!;
      const text = run.map(g => g.text).join('').trim();
      const bold = /Bold$/.test(first.font);
      // A left-aligned tempo heading can sit above the new time signature.
      const atMeter = bold && printed.some(g => g.y > middle && codePoint(g) >= 0xe080 && codePoint(g) <= 0xe089
        && within(first.x, g.x, space * 0.25));
      const inBar = atMeter || within(first.x, start, space * 0.25)
        || (first.x < start && last.x < start && within(last.x, start, space * 1.8));
      const inNext = nextStart !== undefined && first.x < measure.right && within(last.x, nextStart, space * 1.8);
      // A long heading may continue past its barline. Its full run has already been read.
      if (first.x < measure.left && last.x >= measure.left
        && preview.words.some(w => w.beat === preview.bars.at(-1)!.start && w.text === text && w.tempo === bold)) {
        for (const glyph of run) readText.add(glyph);
        continue;
      }
      if (inBar && inNext) return null;
      if (inNext) {
        for (const glyph of run) readText.add(glyph);
        continue;
      }
      if (!inBar) continue;
      if (text) {
        words.push({ beat, below: false, tempo: bold, text });
        for (const glyph of run) readText.add(glyph);
      }
    }
  }
  return words;
}
