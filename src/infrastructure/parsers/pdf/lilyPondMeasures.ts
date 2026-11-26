import { isEmmentalerFont } from './emmentalerGlyphs';
import type { PdfGeometry } from './geometry';
import { center, codePoint, rulings, top, within, type Staff } from './pianoGeometry';

export interface LilyPondMeasure {
  readonly left: number;
  readonly right: number;
  readonly staves: readonly Staff[];
  readonly systemStart: boolean;
  readonly repeatLeft?: number;
}

export function isLilyPondPage(page: PdfGeometry): boolean {
  return page.glyphs.some(glyph => isEmmentalerFont(glyph.font));
}

/** LilyPond rules each staff across a whole system and draws barlines as strokes or thin filled paths. */
function lilyPondMeasures(page: PdfGeometry): LilyPondMeasure[] {
  const lines = rulings(page.segments);
  const strokes = page.fills.flatMap(path => {
    if (path.length < 3 || path.length > 10) return [];
    const left = Math.min(...path.map(p => p.x)), right = Math.max(...path.map(p => p.x));
    const low = Math.min(...path.map(p => p.y)), high = Math.max(...path.map(p => p.y));
    return right > left && high - low > (right - left) * 4 ? [{ x: (left + right) / 2, width: right - left, low, high }] : [];
  });
  for (const line of page.segments) {
    if (within(line.x1, line.x2, 0.04)) strokes.push({ x: line.x1, width: line.width,
      low: Math.min(line.y1, line.y2), high: Math.max(line.y1, line.y2) });
  }
  const bars: LilyPondMeasure[] = [];
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i]!, next = lines[i + 1];
    const { space, left, right } = upper;
    const tolerance = space * 0.2;
    const joins = next && within(next.left, left, tolerance) && within(next.right, right, tolerance)
      && strokes.some(s => within(s.x, left, tolerance) && within(s.low, next.bottom, tolerance)
        && within(s.high, top(upper), tolerance));
    const staves = joins ? [upper, next] : [upper];
    if (joins) i++;
    const bottom = staves.at(-1)!.bottom;
    const endsAt = (y: number, target: number) => within(y, target, tolerance);
    const lowerBars = joins ? strokes.filter(s => endsAt(s.low, bottom) && endsAt(s.high, top(next))) : [];
    const boundaries = strokes.filter(s => endsAt(s.high, top(upper)) && (endsAt(s.low, bottom)
      || (endsAt(s.low, upper.bottom) && lowerBars.some(t => within(t.x, s.x, tolerance)))));
    // The inner stroke of a final thin–thick barline can sit more than one
    // staff space from the system edge. Its gap is measured between ink edges.
    const finalStroke = boundaries.find(s => s.width >= space * 0.4 && within(s.x + s.width / 2, right, tolerance));
    const cuts = boundaries.filter(s => !finalStroke || finalStroke.x - finalStroke.width / 2
      - (s.x + s.width / 2) > space * 0.65)
      .map(s => s.x).filter(x => x > left + space && x < right - space).sort((a, b) => a - b);
    // A system-opening repeat follows the clef and key signature.
    // Keep that header in the first measure and retain the repeat stroke.
    let repeatLeft: number | undefined;
    const firstHead = Math.min(...page.glyphs.filter(g => {
      const code = codePoint(g);
      return (code >= 0xe0a0 && code <= 0xe0af || code >= 0xe4e3 && code <= 0xe4ef)
        && staves.some(staff => within(g.y, center(staff), space * 6)) && g.x >= left;
    }).map(g => g.x));
    while (cuts.length && cuts[0]! < firstHead &&
      boundaries.some(s => s.width > .3 * space && within(s.x, cuts[0]!, space * 1.3))) repeatLeft = cuts.shift();
    let start = left;
    for (const end of [...cuts, right]) {
      // Both strokes of a double barline terminate the same measure.
      if (end - start <= space) continue;
      bars.push({ left: start, right: end, staves, systemStart: start === left, ...(start === left && repeatLeft !== undefined && { repeatLeft }) });
      start = end;
    }
  }
  return bars;
}

/** Stop before the first printed attack that no recognized staff can read. */
export function lilyPondPagePrefix(page: PdfGeometry): { bars: LilyPondMeasure[]; complete: boolean } {
  const bars = lilyPondMeasures(page);
  let limit = bars.length;
  let complete = bars.length > 0;
  for (const glyph of page.glyphs) {
    const code = codePoint(glyph);
    if (!(code >= 0xe0a0 && code <= 0xe0af || code >= 0xe4e3 && code <= 0xe4ef)) continue;
    const near = (staff: Staff) => Math.abs(glyph.y - center(staff)) < staff.space * 10;
    if (bars.some(bar => glyph.x > bar.left && glyph.x < bar.right && bar.staves.some(near))) continue;
    complete = false;
    const firstAfter = bars.findIndex(bar => bar.staves.some(near)
      ? bar.right > glyph.x : center(bar.staves[0]!) < glyph.y);
    if (firstAfter >= 0) limit = Math.min(limit, firstAfter);
  }
  return { bars: bars.slice(0, limit), complete };
}
