import type { PdfGlyph } from './geometry';
import { codePoint, sortedX, within, type BeamStrip } from './pianoGeometry';
import type { Event, TimedNote } from './pianoNotes';

export function isSingleTremoloGlyph(glyph: PdfGlyph): boolean {
  return codePoint(glyph) >= 0xe220 && codePoint(glyph) <= 0xe223;
}

export function isArpeggioGlyph(glyph: PdfGlyph): boolean {
  return [0xeaa9, 0xeaad].includes(codePoint(glyph));
}

/** A measured tremolo between open heads has floating strokes inset from
 * both stems. Its two printed values each occupy half their usual time. */
export function readStemTremolos(events: Event[], glyphs: readonly PdfGlyph[], strips: readonly BeamStrip[], space: number): Event[] | null {
  const changes = new Map<Event, Event>();
  for (const mark of glyphs.filter(isSingleTremoloGlyph)) {
    const targets = events.filter(({ stem, head }) => stem && within(stem.x, mark.x, space * 0.15)
      && (mark.y - head.y) * (stem.up ? 1 : -1) > space * 0.5
      && (stem.far - mark.y) * (stem.up ? 1 : -1) >= 0);
    const event = targets[0];
    if (targets.length !== 1 || !event || changes.has(event) || !within(mark.size, space * 4, space * 0.2)) return null;
    changes.set(event, { ...event, tremolo: { type: 'single', strokes: codePoint(mark) - 0xe220 + 1 } });
  }

  const ordered = sortedX(events.map(event => ({ x: event.head.x, event })));
  for (let i = 1; i < ordered.length; i++) {
    const first = ordered[i - 1]!.event, second = ordered[i]!.event;
    const left = first.stem, right = second.stem;
    if (!left || !right || left.up !== right.up || first.duration.value !== 'half' || second.duration.value !== 'half') continue;
    const sign = left.up ? -1 : 1;
    const strokes = strips.filter(strip => within(strip.left - left.x, 0.45 * space, 0.12 * space)
      && within(right.x - strip.right, 0.45 * space, 0.12 * space)
      && Math.abs(strip.yAt(left.x) - left.far) < space * 3
      && Math.abs(strip.yAt(right.x) - right.far) < space * 3)
      .sort((a, b) => sign * (a.yAt(left.x) - b.yAt(left.x)));
    if (!strokes.length) continue;
    if (events.some(event => event !== first && event !== second
      && (within(event.head.x, first.head.x, space * 0.15) || within(event.head.x, second.head.x, space * 0.15)))
      || glyphs.some(glyph => glyph.x > first.head.x && glyph.x < second.head.x
        && codePoint(glyph) >= 0xe4e3 && codePoint(glyph) <= 0xe4e9)
      || strokes.length > 4 || first.duration.dots || second.duration.dots || changes.has(first) || changes.has(second)
      || [left, right].some(stem => strokes.some((strip, level) =>
        !within(sign * (strip.yAt(stem.x) - stem.far), (0.25 + 0.75 * level) * space, 0.18 * space)))) return null;
    for (const [event, type] of [[first, 'start'], [second, 'stop']] as const) {
      changes.set(event, { ...event, beats: event.beats / 2, tuplet: { actual: 2, normal: 1 }, tremolo: { type, strokes: strokes.length } });
    }
  }
  return changes.size ? events.map(event => changes.get(event) ?? event) : events;
}

/** The repeated Bravura wiggles form one continuous column. Its arrow and
 * bottom bound the chord, which may span both staves of the piano. */
export function readBarArpeggios(glyphs: readonly PdfGlyph[], notes: readonly TimedNote[], space: number): TimedNote[] | null {
  const pending = new Set(glyphs.filter(isArpeggioGlyph));
  const marked = new Set<TimedNote>();
  for (const first of pending) {
    const stack = [...pending].filter(g => within(g.x, first.x, space * 0.1)).sort((a, b) => a.y - b.y);
    if (stack.length < 2 || stack.some((g, i) => !within(g.size, 4 * space, 0.2 * space)
      || codePoint(g) !== (i === stack.length - 1 ? 0xeaad : 0xeaa9)
      || i && !within(g.y - stack[i - 1]!.y, space, space * 0.12))) return null;
    const bottom = stack[0]!.y, top = stack.at(-1)!.y;
    const column = notes.filter(n => within(n.x - first.x, space * 0.65, space * 0.22)
      && n.y >= bottom && n.y <= top + space * 2.3);
    if (column.length < 2 || !within(Math.min(...column.map(n => n.y)) - bottom, space * 0.5, space * 0.25)
      || !within(Math.max(...column.map(n => n.y)) - top, space * 1.5, space * 0.75)
      || column.some(n => n.note.beat !== column[0]!.note.beat || n.note.headless || marked.has(n))) return null;
    const partialChord = notes.some(n => !column.includes(n) && column.some(member =>
      n.note.staff === member.note.staff && n.note.voice === member.note.voice && n.note.beat === member.note.beat));
    if (partialChord) return null;
    for (const n of column) marked.add(n);
    for (const g of stack) pending.delete(g);
  }
  return notes.map(n => marked.has(n) ? { ...n, note: { ...n.note, arpeggio: 'up' } } : n);
}
