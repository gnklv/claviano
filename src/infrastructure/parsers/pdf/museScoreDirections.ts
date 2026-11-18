import type { Notation } from '../../../domain/notation/notation';
import { dynamicWords } from '../../../domain/notation/dynamics';
import type { PdfGeometry, PdfGlyph, PdfSegment } from './geometry';
import { codePoint, sortedX, top, within, type Measure } from './pianoGeometry';
import { applyMuseScoreNavigation } from './museScoreNavigation';
import { readMuseScorePedals } from './museScorePedals';
import type { TimedNote } from './pianoNotes';

export interface MuseScoreDirectionBar {
  geometry: PdfGeometry;
  measure: Measure;
  index: number;
  notes: readonly TimedNote[];
  columns?: readonly { x: number; beat: number }[];
}

type System = MuseScoreDirectionBar[];

function systemsOf(bars: readonly MuseScoreDirectionBar[]): System[] {
  const systems: System[] = [];
  for (const bar of bars) {
    const system = systems.at(-1);
    const last = system?.at(-1);
    if (last && system && bar.geometry === last.geometry
      && within(bar.measure.staves[0].bottom, last.measure.staves[0].bottom, 0.04)) system.push(bar);
    else systems.push([bar]);
  }
  return systems;
}

function anchor(notation: Notation, system: System, x: number, end = false) {
  const entry = system.find(b => x < b.measure.right + (end ? 0.04 : 0)) ?? system.at(-1)!;
  const bar = notation.bars[entry.index]!;
  const columns = entry.columns?.length ? entry.columns : entry.notes.map(n => ({ x: n.columnX ?? n.x, beat: n.note.beat }));
  const barEnd = bar.start + bar.length;
  if (end && x >= entry.measure.right - entry.measure.staves[0].space * 1.75) return { index: entry.index, beat: barEnd };
  const closest = columns.reduce<(typeof columns)[number] | null>((a, b) => !a || Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a, null);
  return { index: entry.index, beat: closest?.beat ?? bar.start };
}

function runs(glyphs: PdfGlyph[]): PdfGlyph[][] {
  const rows = new Map<string, PdfGlyph[]>();
  for (const glyph of glyphs) {
    const key = [glyph.font, glyph.y, glyph.size, glyph.textObject].join('/');
    const row = rows.get(key) ?? [];
    row.push(glyph);
    rows.set(key, row);
  }
  const result: PdfGlyph[][] = [];
  for (const row of rows.values()) {
    let run: PdfGlyph[] = [];
    for (const glyph of sortedX(row)) {
      const last = run.at(-1);
      if (!last || glyph.x - last.x > glyph.size * 1.05) {
        run = [];
        result.push(run);
      }
      run.push(glyph);
    }
  }
  return result;
}

const dynamicsByCode: Readonly<Record<number, string>> = {
  0xe520: 'p', 0xe521: 'm', 0xe522: 'f', 0xe52b: 'pp', 0xe52c: 'mp', 0xe52d: 'mf', 0xe52f: 'ff',
};

function wedgeSegments(segments: PdfSegment[], system: System) {
  const { measure } = system[0]!;
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const right = system.at(-1)!.measure.right;
  const arms = segments.map(s => s.x1 <= s.x2 ? s : { x1: s.x2, x2: s.x1, y1: s.y2, y2: s.y1 })
    .filter(s => s.x1 >= measure.left - space * 0.2 && s.x2 <= right + space * 0.2 && s.x2 - s.x1 > space * 1.5
      && Math.abs(s.y2 - s.y1) > space * 0.05 && Math.abs(s.y2 - s.y1) < space * 1.6
      && s.y1 < upper.bottom && s.y2 < upper.bottom && s.y1 > lower.bottom - space * 6 && s.y2 > lower.bottom - space * 6);
  return arms.flatMap((a, index) => arms.slice(index + 1).flatMap(b => {
    if (!within(a.x1, b.x1, space * 0.12) || !within(a.x2, b.x2, space * 0.12)
      || (a.y2 - a.y1) * (b.y2 - b.y1) >= 0) return [];
    const leftGap = Math.abs(a.y1 - b.y1) / space, rightGap = Math.abs(a.y2 - b.y2) / space;
    if (Math.max(leftGap, rightGap) > 2.5 || Math.abs(leftGap - rightGap) < 0.3) return [];
    return [{ left: a.x1, right: a.x2, leftGap, rightGap, below: a.y1 < lower.bottom }];
  })).sort((a, b) => a.left - b.left);
}

export function applyMuseScoreDirections(notation: Notation, bars: readonly MuseScoreDirectionBar[]): Notation {
  const tempoMarks: Notation['tempoMarks'][number][] = [];
  const tempos: Notation['tempos'][number][] = [];
  const dynamics: Notation['dynamics'][number][] = [];
  const words: Notation['words'][number][] = [];
  const hairpins: Notation['hairpins'][number][] = [];
  let precedingWedge: number | undefined;
  const systems = systemsOf(bars);
  for (const system of systems) {
    const { geometry, measure } = system[0]!;
    const [upper, lower] = measure.staves;
    const space = upper.space, right = system.at(-1)!.measure.right;
    const glyphs = geometry.glyphs.filter(g => g.x >= measure.left - space && g.x <= right + space
      && g.y > lower.bottom - space * 9 && g.y < top(upper) + space * 7);
    const inGap = (g: PdfGlyph) => g.y < upper.bottom && g.y > top(lower) - space * 0.25;
    const dyn = glyphs.filter(g => (g.font === 'MScoreText' || g.font === 'Leland') && dynamicsByCode[codePoint(g)] && inGap(g));
    const dynamicAnchors = [];
    for (const run of runs(dyn)) {
      const first = run[0]!;
      const text = run.map(g => dynamicsByCode[codePoint(g)]).join('');
      if (!/^(p{1,4}|f{1,4}|m[fp])$/.test(text)) continue;
      const at = anchor(notation, system, (first.x + run.at(-1)!.x) / 2 + space * 0.55);
      dynamicAnchors.push({ glyph: first, beat: at.beat });
      dynamics.push({ beat: at.beat, below: false, letters: true, text });
    }
    const labels = glyphs.filter(g => /^(FreeSerif(Italic)?|Edwin-Italic)$/.test(g.font)
      && (g.y > top(upper) || inGap(g)) && g.size <= space * 2.5);
    const headings = [];
    for (const run of runs(labels)) {
      const first = run[0]!;
      const text = run.map(g => g.text).join('').replace(/\s+/gu, ' ').trim();
      if (!/\p{L}/u.test(text)) continue;
      const below = inGap(first);
      // Direction text shares a rhythmic column with the syllable or symbol before it.
      const preceding = below && dynamicAnchors.find(({ glyph }) => within(glyph.y, first.y, space * 1.05)
        && first.x > glyph.x && first.x - glyph.x <= space * 1.9);
      const at = anchor(notation, system, first.x);
      if (preceding) at.beat = preceding.beat;
      if (!below) headings.push({ end: run.at(-1)!, at });
      if (dynamicWords(text)) dynamics.push({ beat: at.beat, below: first.y < lower.bottom, letters: false, text });
      else words.push({ beat: at.beat, below, tempo: false, text });
    }

    const units = glyphs.filter(g => codePoint(g) === 0xeca5 && g.y > top(upper));
    for (const unit of units) {
      const after = sortedX(glyphs.filter(g => g.x > unit.x && g.x < unit.x + space * 10
        && within(g.y, unit.y, space * 0.08) && (codePoint(g) === 0xecb7 || /Bold/.test(g.font))));
      const printed = after.map(g => g.text).join('').replace(/\s/g, '').match(/^(\uECB7)?=(\d{1,3})/u);
      if (!printed) continue;
      const perMinute = Number(printed[2]);
      const dots = printed[1] ? 1 : 0;
      const heading = headings.find(({ end }) => within(end.y, unit.y, space * 0.35)
        && unit.x > end.x && unit.x - end.x < space * 2.5);
      const at = heading?.at ?? anchor(notation, system, unit.x);
      tempoMarks.push({ beat: at.beat, unit: { value: 'quarter', dots }, perMinute, printed: true });
      tempos.push({ bar: at.index, beat: at.beat, bpm: perMinute * (dots ? 1.5 : 1) });
    }

    const previous = precedingWedge;
    precedingWedge = undefined;
    for (const wedge of wedgeSegments(geometry.segments, system)) {
      const type = wedge.leftGap < wedge.rightGap ? 'crescendo' : 'diminuendo';
      const start = anchor(notation, system, wedge.left).beat;
      const end = anchor(notation, system, wedge.right + space * 0.2, true).beat;
      if (end <= start) continue;
      const last = previous === undefined ? undefined : hairpins[previous];
      if (last && start === last.end && last.type === type && last.below === wedge.below && wedge.leftGap > 0.15) {
        hairpins[previous!] = { ...last, end };
      } else hairpins.push({ start, end, below: wedge.below, type, drawn: true });
      if (within(wedge.right, right, space * 0.4)) precedingWedge = hairpins.length - 1;
    }
  }
  const pedals = readMuseScorePedals(notation, systems);
  return applyMuseScoreNavigation({ ...notation, ...pedals, tempos, tempoMarks, words, dynamics, hairpins }, bars);
}
