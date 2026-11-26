import type { Notation } from '../../../domain/notation/notation';
import { tempoWord } from './pianoDirections';
import { jumpWords } from './pianoNavigation';
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
  columns?: readonly { x: number; beat: number; rest?: { staff: number; beats: number } }[];
}

type System = MuseScoreDirectionBar[];

export function systemsOf(bars: readonly MuseScoreDirectionBar[]): System[] {
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
  const space = entry.measure.staves[0].space;
  if (end) {
    const lastColumn = Math.max(...columns.map(column => column.x));
    // In a wide measure with a held note, the endpoint can be well before the barline.
    const heldToBarline = entry.notes.some(({ note }) => note.beat + note.beats >= barEnd);
    if (x >= entry.measure.right - space * 1.75
      || x >= entry.measure.right - space * 3 && lastColumn < x - space * 0.65
      || heldToBarline && x > (lastColumn + entry.measure.right) / 2) {
      return { index: entry.index, beat: barEnd };
    }
  }
  const closest = columns.reduce<(typeof columns)[number] | null>((a, b) => !a || Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a, null);
  return { index: entry.index, beat: closest?.beat ?? bar.start };
}

function runs(glyphs: PdfGlyph[], gapAfter?: (glyph: PdfGlyph) => number): PdfGlyph[][] {
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
    for (const glyph of row) {
      const last = run.at(-1);
      if (!last || glyph.x < last.x - glyph.size * 0.1 || glyph.x - last.x > glyph.size * (gapAfter?.(last) ?? 1.05)) {
        run = [];
        result.push(run);
      }
      run.push(glyph);
    }
  }
  return result;
}

const labelFonts = /^(FreeSerif(Italic)?|Edwin-(Italic|Roman|Bold|BdIta)|TimesNewRomanPS-BoldMT)$/;

const boldDirectionFonts = new Set(['Edwin-BdIta', 'TimesNewRomanPS-BoldMT']);

const dynamicsByCode: Readonly<Record<number, string>> = {
  0xe520: 'p', 0xe521: 'm', 0xe522: 'f', 0xe523: 'r', 0xe524: 's', 0xe525: 'z', 0xe52a: 'ppp', 0xe52b: 'pp', 0xe52c: 'mp', 0xe52d: 'mf', 0xe52f: 'ff', 0xe534: 'fp', 0xe535: 'fz', 0xe539: 'sfz',
};

function appendInlineDynamic(labels: PdfGlyph[][], glyph: PdfGlyph, dynamic: string): boolean {
  const sameLine = (label: PdfGlyph, tolerance: number) =>
    within(label.size, glyph.size, glyph.size * 0.03) && within(label.y, glyph.y, glyph.size * tolerance);
  const preceding = (x: number, maxGap: number, tolerance: number) => labels
    .filter(run => run.at(-1)!.x < x && x - run.at(-1)!.x <= glyph.size * maxGap
      && sameLine(run.at(-1)!, tolerance) && run.some(letter => /\p{L}/u.test(letter.text)))
    .sort((a, b) => b.at(-1)!.x - a.at(-1)!.x)[0];
  const nearby = preceding(glyph.x, 0.65, 0.02);
  if (!nearby) return false;
  nearby.push({ ...glyph, text: ` ${dynamic}` });
  // Multi-part directions can use separate text objects with slightly
  // different baselines. Join adjoining words only when they lead to a symbol.
  let previous = preceding(nearby[0]!.x, 1.25, 0.07);
  while (previous) {
    nearby.unshift(...previous, { ...nearby[0]!, text: ' ' });
    labels.splice(labels.indexOf(previous), 1);
    previous = preceding(nearby[0]!.x, 1.25, 0.07);
  }
  return true;
}

function wedgeSegments(segments: PdfSegment[], system: System, neighbours: System[]) {
  const { measure } = system[0]!;
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const right = system.at(-1)!.measure.right;
  const arms = segments.map(s => s.x1 <= s.x2 ? s : { x1: s.x2, x2: s.x1, y1: s.y2, y2: s.y1 })
    .filter(s => s.x1 >= measure.left - space * 0.2 && s.x2 <= right + space && s.x2 - s.x1 > space * 0.8
      && Math.abs(s.y2 - s.y1) < space * 1.6
      && ((s.y1 < upper.bottom && s.y2 < upper.bottom)
        || (s.y1 > top(upper) && s.y2 > top(upper)))
      && Math.min(s.y1, s.y2) > lower.bottom - space * 8 && Math.max(s.y1, s.y2) < top(upper) + space * 6);
  return arms.flatMap((a, index) => arms.slice(index + 1).flatMap(b => {
    if (!within(a.x1, b.x1, space * 0.12) || !within(a.x2, b.x2, space * 0.12)) return [];
    const leftGap = Math.abs(a.y1 - b.y1) / space, rightGap = Math.abs(a.y2 - b.y2) / space;
    if (Math.max(leftGap, rightGap) > 2.5 || Math.abs(leftGap - rightGap) < 0.3) return [];
    // Tilting a wedge can flatten one arm or give both arms the same slope.
    const splayed = (a.y2 - a.y1) * (b.y2 - b.y1) < 0;
    const connected = Math.min(leftGap, rightGap) < 0.12 && Math.max(leftGap, rightGap) >= 0.6;
    if (!splayed && !connected) return [];
    const y = (a.y1 + b.y1) / 2;
    const distance = Math.max(y - top(upper), lower.bottom - y, 0);
    if (distance && neighbours.some(other => {
      const [first] = other;
      if (!first || first.geometry !== system[0]!.geometry || other === system
        || a.x1 < first.measure.left || a.x2 > other.at(-1)!.measure.right) return false;
      const [high, low] = first.measure.staves;
      return Math.max(y - top(high), low.bottom - y, 0) < distance;
    })) return [];
    return [{ left: a.x1, right: a.x2, y, leftGap, rightGap, below: y < lower.bottom }];
  })).sort((a, b) => a.left - b.left);
}

export function applyMuseScoreDirections(notation: Notation, bars: readonly MuseScoreDirectionBar[]): Notation {
  const tempoMarks: Notation['tempoMarks'][number][] = [];
  const tempos: Notation['tempos'][number][] = [];
  const dynamics: Notation['dynamics'][number][] = [];
  const words: Notation['words'][number][] = [];
  const hairpins: Notation['hairpins'][number][] = [];
  let precedingWedge: { index: number; barEnd: number } | undefined;
  const writtenBars = notation.bars.map(bar => ({ ...bar }));
  const systems = systemsOf(bars);
  const opening = systems[0]?.[0];
  const openingStaff = opening?.measure.staves[0];
  // Titles and credits in the same text object belong to the page heading.
  const titleObjects = new Set(opening && openingStaff ? opening.geometry.glyphs.filter(g =>
    g.textObject !== undefined && labelFonts.test(g.font) && /\p{L}/u.test(g.text)
    && g.size > openingStaff.space * 3 && g.y > top(openingStaff) + openingStaff.space * 7)
    .map(g => g.textObject) : []);
  for (const system of systems) {
    const { geometry, measure } = system[0]!;
    const [upper, lower] = measure.staves;
    const space = upper.space, right = system.at(-1)!.measure.right;
    const glyphs = geometry.glyphs.filter(g => g.x >= measure.left - space && g.x <= right + space
      && g.y > lower.bottom - space * 9 && g.y < top(upper) + space * 7);
    const inGap = (g: PdfGlyph) => g.y < upper.bottom && g.y > top(lower) - space * 0.25;
    // Segno and coda are centred at the start of a measure. Their text
    // origin can lie across the preceding barline or outside the system.
    for (const sign of geometry.glyphs.filter(g => g.y > top(upper) && g.y < top(upper) + space * 7
      && [0xe047, 0xe048].includes(codePoint(g)))) {
      const x = sign.x + space * 1.5;
      const bar = system.find(b => x >= b.measure.left && x < b.measure.right);
      if (!bar) continue;
      const target = writtenBars[bar.index]!;
      target.navigation = { ...target.navigation, ...(codePoint(sign) === 0xe047
        ? { segno: true, segnoSign: true } : { coda: true, codaSign: true }) };
    }
    const labels = runs(glyphs.filter(g => labelFonts.test(g.font)
      && (geometry !== opening?.geometry || !titleObjects.has(g.textObject))
      && (g.y > top(upper) && g.size <= space * 3 || inGap(g) && g.size <= space * 2.5)));
    // Below-staff dynamics belong to the system above the inter-system gap.
    // A mark above the treble staff is independent when that gap is clear.
    const belongsHere = (g: PdfGlyph) => inGap(g) || g.y < lower.bottom || g.y > top(upper)
      && !systems.some(other => {
        const first = other[0]!;
        if (first.geometry !== geometry || other === system || g.x < first.measure.left - space
          || g.x > other.at(-1)!.measure.right + space) return false;
        const staff = first.measure.staves[1];
        return g.y < staff.bottom && g.y > staff.bottom - staff.space * 9;
      });
    const dyn = glyphs.filter(g => (g.font === 'MScoreText' || g.font === 'Leland' || g.font === 'LelandText' || g.musicEncoding === 'smufl') && dynamicsByCode[codePoint(g)] && belongsHere(g));
    const dynamicAnchors = [];
    for (const run of runs(dyn, glyph => codePoint(glyph) === 0xe534 ? 1.25 : 1.05)) {
      const first = run[0]!;
      const text = run.map(g => dynamicsByCode[codePoint(g)]).join('');
      if (!/^(p{1,6}|f{1,6}|m[fp]|s?f{1,2}(?:z|p{1,2})?|rfz?)$/.test(text)) continue;
      if (inGap(first) && appendInlineDynamic(labels, first, text)) continue;
      // A fused forte-piano glyph is centred over its note as a single wide mark.
      const center = (first.x + run.at(-1)!.x) / 2 + (run.length === 1 && text === 'fp' ? first.size * 0.6 : 0);
      const at = anchor(notation, system, center);
      dynamicAnchors.push({ glyph: first, last: run.at(-1)!, beat: at.beat });
      dynamics.push({ beat: at.beat, below: first.y < lower.bottom, letters: true, text });
    }
    const headings = [];
    for (const run of labels) {
      const first = run[0]!;
      const text = run.map(g => g.text).join('').replace(/\s+/gu, ' ').trim();
      if (!/\p{L}/u.test(text)) continue;
      const below = inGap(first);
      // Direction text shares a rhythmic column with the syllable or symbol before it.
      const preceding = below && dynamicAnchors.find(({ glyph }) => within(glyph.y, first.y, space * 1.05)
        && first.x > glyph.x && first.x - glyph.x <= space * 1.9);
      const end = run.at(-1)!;
      // A long heading over the opening clef can be centered over its entry.
      const x = !below && system[0] === opening && first.x <= measure.left + space
        && end.x - first.x > space * 12 ? (first.x + end.x + end.size * 0.5) / 2 : first.x;
      const at = anchor(notation, system, x);
      if (preceding) at.beat = preceding.beat;
      const jump = !below && jumpWords(text);
      if (jump) {
        const bar = writtenBars[at.index]!;
        bar.navigation = { ...bar.navigation, ...jump };
        continue;
      }
      if (!below) headings.push({ end, at });
      if (dynamicWords(text)) dynamics.push({ beat: at.beat, below: first.y < lower.bottom, letters: false, text });
      else {
        const namedTempo = !below && first.font === 'Edwin-Bold' && tempoWord.test(text);
        words.push({ beat: at.beat, below, tempo: namedTempo || boldDirectionFonts.has(first.font), text });
      }
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
    const finalBar = notation.bars[system.at(-1)!.index]!;
    for (const wedge of wedgeSegments(geometry.segments, system, systems)) {
      const type = wedge.leftGap < wedge.rightGap ? 'crescendo' : 'diminuendo';
      // A hairpin squeezed between two dynamics can be shorter than a notehead.
      // Both labels then establish its endpoints and distinguish it from an accent.
      const compact = wedge.right - wedge.left <= space * 1.5;
      const before = dynamicAnchors.filter(({ last }) => last.x < wedge.left
        && wedge.left - last.x <= space * (compact ? 3 : dynamicsByCode[codePoint(last)] === 'mf' ? 3.5 : 2.5) && within(last.y, wedge.y, space * 0.75));
      const after = dynamicAnchors.filter(({ glyph }) => glyph.x > wedge.right
        && glyph.x - wedge.right <= space * (compact ? 2 : 1) && within(glyph.y, wedge.y, space * 0.75));
      if (compact && (before.length !== 1 || after.length !== 1)) continue;
      const start = before[0]?.beat ?? anchor(notation, system, wedge.left).beat;
      const end = after[0]?.beat ?? anchor(notation, system, wedge.right + space * 0.2, true).beat;
      if (end <= start) continue;
      const last = previous && hairpins[previous.index];
      const continues = previous && last && start === previous.barEnd && last.type === type && last.below === wedge.below
        && wedge.leftGap > 0.15 && (wedge.left <= measure.left + space * 7
          || system[0]!.columns?.some(c => c.beat === start && wedge.left <= c.x && c.x - wedge.left <= 2 * space));
      if (continues) {
        hairpins[previous.index] = { ...last, end };
      } else hairpins.push({ start, end, below: wedge.below, type, drawn: true });
      // An open segment can stop short of the barline to leave room for a repeat sign.
      if (wedge.rightGap > 0.15 && wedge.right >= right - space * 3) {
        precedingWedge = { index: continues ? previous.index : hairpins.length - 1, barEnd: finalBar.start + finalBar.length };
      }
    }
  }
  const pedals = readMuseScorePedals(notation, systems);
  return applyMuseScoreNavigation({ ...notation, bars: writtenBars, ...pedals, tempos, tempoMarks, words, dynamics, hairpins }, bars);
}
