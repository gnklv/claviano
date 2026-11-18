import type { OrnamentKind, OrnamentMark } from '../../../domain/notation/ornaments';
import type { PdfGlyph } from './geometry';
import { ACCIDENTALS, FLAT, codePoint, isAccidental, sortedX, top, within, type Measure } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

const signs = new Map<number, { kind: OrnamentKind; offset: number }>([
  [0xe566, { kind: 'trill', offset: -0.46 }],
  [0xe56c, { kind: 'inverted-mordent', offset: -0.86 }],
  [0xe56d, { kind: 'mordent', offset: -0.86 }],
  [0xe567, { kind: 'turn', offset: -0.33 }],
]);
const WIGGLE = 0xe59d;
const WIGGLE_END = 0xe59e;

export function isOrnamentGlyph(glyph: PdfGlyph, space: number): boolean {
  const code = codePoint(glyph);
  return signs.has(code) || code === WIGGLE || code === WIGGLE_END
    || (isAccidental(glyph) && within(glyph.size, space * 2, space * 0.12));
}

/** A delayed turn lies halfway to the next onset on its staff (or to the barline).
 * Bravura's trill extension consists of adjoining glyphs and a separate end cap. */
export function readBarOrnaments(glyphs: readonly PdfGlyph[], notes: readonly TimedNote[], measure: Measure): TimedNote[] | null {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const symbols = glyphs.filter(g => isOrnamentGlyph(g, space));
  if (!symbols.length) return [...notes];
  const consumed = new Set<PdfGlyph>();
  const marks = new Map<TimedNote, { mark: OrnamentMark; trillLine: boolean }>();
  for (const sign of symbols) {
    const spec = signs.get(codePoint(sign));
    if (!spec) continue;
    if (!within(sign.size, space * 4, space * 0.2)) return null;
    const staff = sign.y > (upper.bottom + top(lower)) / 2 ? 1 : 2;
    const heads = sortedX(notes.filter(n => n.note.staff === staff && !n.note.headless));
    const candidates = heads.flatMap(entry => {
      const distance = (sign.y - entry.y) / space;
      if (distance < 0.45 || distance > 4.5) return [];
      const end = heads.find(n => n.note.voice === entry.note.voice && n.note.beat > entry.note.beat)?.x ?? measure.right;
      if (within(sign.x, entry.x + spec.offset * space, space * 0.24)) return [{ entry, kind: spec.kind, end }];
      if (spec.kind === 'turn' && sign.x > entry.x + space * 1.5
        && within(sign.x, (end + entry.x) / 2, space * 0.35)) return [{ entry, kind: 'delayed-turn' as const, end }];
      return [];
    });
    if (candidates.length !== 1) return null;
    const { entry, kind, end } = candidates[0]!;
    if (marks.has(entry)) return null;
    const accidentals = symbols.filter(g => isAccidental(g) && within(g.x, sign.x + space * 0.75, space * 0.22)
      && within(Math.abs(g.y - sign.y), space * 0.85, space * 0.2));
    if (accidentals.length > 1) return null;
    const accidental = accidentals[0];
    if (accidental && consumed.has(accidental)) return null;
    const alteration = accidental ? ACCIDENTALS[codePoint(accidental) - FLAT]![0] : null;
    if (accidental) consumed.add(accidental);
    let trillLine = false;
    if (kind === 'trill') {
      const pieces = sortedX(symbols.filter(g => [WIGGLE, WIGGLE_END].includes(codePoint(g))
        && g.x > sign.x && g.x < end && within(g.y, sign.y + space * 0.53, space * 0.15)));
      if (pieces.length) {
        if (codePoint(pieces.at(-1)!) !== WIGGLE_END || !within(end - pieces.at(-1)!.x, space * 2.5, space * 0.65)) return null;
        for (const [i, piece] of pieces.entries()) {
          if (consumed.has(piece) || (i < pieces.length - 1 && codePoint(piece) !== WIGGLE)
            || !within(piece.size, space * 4, space * 0.2)
            || !within(piece.x, i ? pieces[i - 1]!.x + space * 1.04 : sign.x + space * 2.09, space * 0.15)) return null;
          consumed.add(piece);
        }
        trillLine = true;
      }
    }
    marks.set(entry, { mark: { kind, below: false, accidentalAbove: accidental && accidental.y > sign.y ? alteration : null,
      accidentalBelow: accidental && accidental.y < sign.y ? alteration : null }, trillLine });
    consumed.add(sign);
  }
  if (consumed.size !== symbols.length) return null;
  return notes.map(entry => {
    const mark = marks.get(entry);
    return mark ? { ...entry, note: { ...entry.note, ornaments: [mark.mark], trillLine: mark.trillLine } } : entry;
  });
}
