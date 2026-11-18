import type { BarNavigation } from '../../../domain/notation/navigation';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { textRuns } from './pianoDirections';
import { codePoint, top, within, type Measure } from './pianoGeometry';

const REPEAT_DOT = 0xe044;
const SEGNO = 0xe047;
const CODA = 0xe048;

export function isNavigationGlyph(glyph: PdfGlyph, measure: Measure): boolean {
  const [upper] = measure.staves;
  if (glyph.x < measure.left || glyph.x >= measure.right) return false;
  const code = codePoint(glyph);
  if (code === REPEAT_DOT) return measure.staves.some(staff =>
    [1.5, 2.5].some(line => within(glyph.y, staff.bottom + line * staff.space, staff.space * 0.12)));
  return (code === SEGNO || code === CODA) && glyph.y > top(upper) && glyph.y < top(upper) + upper.space * 8;
}

function jumpWords(text: string): BarNavigation | undefined {
  if (/^To Coda$/i.test(text)) return { toCoda: true, text };
  if (/^D\.S\.( al (Coda|Fine))?$/i.test(text)) return { jump: 'dalsegno', text };
  if (/^D\.C\.( al (Coda|Fine))?$/i.test(text)) return { jump: 'dacapo', text };
  if (/^Fine$/i.test(text)) return { fine: true, text };
}

/** Read paired repeat dots, one-bar volta brackets, signs and aligned jump instructions. */
export function readBarNavigation(geometry: PdfGeometry, measure: Measure, firstX: number): {
  navigation: BarNavigation; readText: PdfGlyph[];
} | null {
  const [upper] = measure.staves;
  const space = upper.space;
  const close = (a: number, b: number) => within(a, b, space * 0.15);
  const navigation: { -readonly [K in keyof BarNavigation]: BarNavigation[K] } = {};
  const readText: PdfGlyph[] = [];
  const glyphs = geometry.glyphs.filter(g => isNavigationGlyph(g, measure));
  for (const sign of glyphs.filter(g => codePoint(g) !== REPEAT_DOT)) {
    if (!within(sign.x, firstX, space * 0.3)) return null;
    if (codePoint(sign) === SEGNO) navigation.segno = navigation.segnoSign = true;
    else navigation.coda = navigation.codaSign = true;
  }
  const dots = glyphs.filter(g => codePoint(g) === REPEAT_DOT);
  const groups = new Map<number, PdfGlyph[]>();
  for (const dot of dots) {
    const group = groups.get(dot.x) ?? [];
    group.push(dot);
    groups.set(dot.x, group);
  }
  for (const [x, group] of groups) {
    if (group.length !== 4 || !measure.staves.every(staff => [1.5, 2.5].every(line =>
      group.some(dot => close(dot.y, staff.bottom + line * space))))) return null;
    const before = x < firstX;
    const adjacentBars = geometry.segments.filter(line => close(line.x1, line.x2)
      && within(line.x1, x, space * 1.6) && (before ? line.x1 < x : line.x1 > x)
      && close(Math.max(line.y1, line.y2), top(upper))
      && Math.min(line.y1, line.y2) <= upper.bottom + space * 0.15);
    if (new Set(adjacentBars.map(line => line.x1)).size < 2) return null;
    if (before) navigation.repeatStart = true;
    else navigation.repeatEnd = { times: 2 };
  }

  const rows = new Map<number, PdfGlyph[]>();
  for (const glyph of geometry.glyphs) {
    if (!/(Italic|Bold)$/.test(glyph.font) || glyph.y <= top(upper) || glyph.y > top(upper) + space * 7) continue;
    const row = rows.get(glyph.y) ?? [];
    row.push(glyph);
    rows.set(glyph.y, row);
  }
  for (const row of rows.values()) {
    for (const run of textRuns(row, space)) {
      const first = run[0]!, last = run.at(-1)!;
      const text = run.map(g => g.text).join('').trim();
      if (within(first.x, firstX, space * 0.25)
        || (first.x < firstX && last.x < firstX && within(last.x, firstX, space * 1.25))) {
        const jump = jumpWords(text);
        if (jump) {
          if (navigation.text) return null;
          Object.assign(navigation, jump);
          readText.push(...run);
        }
      }
      if (!/Bold$/.test(first.font) || !/^\d+(?:,\s*\d+)*\.?$/.test(text)
        || first.x < measure.left || first.x > firstX + space) continue;
      const rails = geometry.segments.filter(line => close(line.y1, line.y2)
        && within(line.x1, first.x - space * 0.4, space * 0.18)
        && within(line.y1, first.y + space * 1.8, space * 0.3)
        && within(line.x2, measure.right, space * 1.3));
      if (!rails.length) continue;
      if (rails.length !== 1 || navigation.ending) return null;
      const rail = rails[0]!;
      const hook = (x: number) => geometry.segments.some(line =>
        close(x, line.x1) && close(x, line.x2) && close(line.y1, rail.y1) && close(line.y2, first.y));
      if (!hook(rail.x1)) return null;
      navigation.ending = text.match(/\d+/g)!.map(Number);
      navigation.endingLabel = text;
      navigation.endingClosed = hook(rail.x2);
      readText.push(...run);
    }
  }
  return { navigation, readText };
}
