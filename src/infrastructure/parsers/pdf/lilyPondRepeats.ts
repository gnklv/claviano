import type { PdfGeometry, PdfGlyph } from './geometry';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { center, codePoint, DOT, within } from './pianoGeometry';

/** A repeat prints two dots straddling the middle line on each staff. */
export function repeatDots(geometry: PdfGeometry, rows: PdfGlyph[][], measure: LilyPondMeasure) {
  const dots = new Set<PdfGlyph>();
  function atEdge(x: number) {
    const { space, bottom } = measure.staves[0]!;
    const heavyStroke = (cx: number, width: number, low: number, high: number) =>
      within(cx, x, space * 1.3) && width > space * .3 && width < space
      && low <= bottom + space * .1 && high >= bottom + space * 3.9;
    const ruled = geometry.segments.some(l => within(l.x1, l.x2, .04 * space)
      && heavyStroke(l.x1, l.width, Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)));
    const filled = !ruled && geometry.fills.some(path => {
      if (path.length !== 4) return false;
      const xs = path.map(p => p.x), ys = path.map(p => p.y);
      const left = Math.min(...xs), right = Math.max(...xs);
      return heavyStroke((left + right) / 2, right - left, Math.min(...ys), Math.max(...ys));
    });
    if (!ruled && !filled) return false;
    const pairs = rows.map((glyphs, i) => {
      const staff = measure.staves[i]!;
      const near = glyphs.filter(g => codePoint(g) === DOT && within(x, g.x, 2.2 * staff.space));
      const upper = near.find(g => within(g.y, center(staff) + staff.space / 2, .1 * staff.space));
      const lower = upper && near.find(g => within(g.x, upper.x, .1 * staff.space)
        && within(g.y, center(staff) - staff.space / 2, .1 * staff.space));
      return upper && lower ? [upper, lower] : [];
    });
    if (!pairs.every(pair => pair.length === 2)) return false;
    for (const glyph of pairs.flat()) dots.add(glyph);
    return true;
  }
  const repeatStart = atEdge(measure.repeatLeft ?? measure.left), repeatEnd = atEdge(measure.right);
  return { dots, navigation: { ...(repeatStart && { repeatStart }), ...(repeatEnd && { repeatEnd: { times: 2 } }) } };
}

/** A LilyPond volta is a ruled bracket with a hooked left edge and a numbered label. */
export function volta(geometry: PdfGeometry, measure: LilyPondMeasure) {
  const staff = measure.staves[0]!, s = staff.space;
  for (const line of geometry.segments) {
    const left = Math.min(line.x1, line.x2), right = Math.max(line.x1, line.x2), y = line.y1;
    if (!within(line.y2, y, .04 * s) || y < staff.bottom + 4.5 * s || y > staff.bottom + 16 * s
      || right - left < 3 * s || left >= measure.right - s || right <= measure.left + s) continue;
    const hook = (x: number) => geometry.segments.some(h => within(h.x1, x, .1 * s) && within(h.x2, x, .1 * s)
      && within(Math.max(h.y1, h.y2), y, .1 * s) && within(Math.abs(h.y1 - h.y2), 2 * s, .5 * s));
    if (!hook(left)) continue;
    const digit = geometry.glyphs.find(g => g.x > left && g.x < left + 2 * s
      && within(g.y, y - 1.6 * s, .5 * s) && codePoint(g) >= 0xe081 && codePoint(g) <= 0xe089);
    if (!digit) continue;
    const number = codePoint(digit) - 0xe080;
    return { ending: [number], ...(left >= measure.left - s && { endingLabel: String(number) }),
      ...(right <= measure.right + s && hook(right) && { endingClosed: true }) };
  }
  return {};
}
