import type { Articulation } from '../../../domain/notation/written';
import type { PdfGlyph, PdfPoint } from './geometry';
import { codePoint, within } from './pianoGeometry';
import type { TimedNote } from './pianoNotes';

// Bravura glyph origins are measured from the left edge of each symbol. These
// offsets align them with the center of a standard filled or open notehead.
const GLYPHS = new Map<number, { kind: Articulation; offset: number }>([
  [0xe4a0, { kind: 'accent', offset: -0.09 }],
  [0xe4a2, { kind: 'staccato', offset: 0.42 }],
  [0xe4a4, { kind: 'tenuto', offset: -0.09 }],
  [0xe4a6, { kind: 'staccatissimo', offset: 0.42 }],
  [0xe4a8, { kind: 'staccatissimo', offset: 0.42 }],
  [0xe4ac, { kind: 'marcato', offset: 0.12 }],
]);

function glyphKind(glyph: PdfGlyph) {
  const code = codePoint(glyph);
  return GLYPHS.get(code - code % 2);
}

export function isArticulationGlyph(glyph: PdfGlyph): boolean {
  return glyphKind(glyph) !== undefined;
}

export function isFermataGlyph(glyph: PdfGlyph): boolean {
  return codePoint(glyph) === 0xe4c0 || codePoint(glyph) === 0xe4c1;
}

function noteChords(notes: readonly TimedNote[]): TimedNote[][] {
  const chords = new Map<string, TimedNote[]>();
  for (const entry of notes) {
    if (entry.note.headless) continue;
    const key = `${entry.note.staff}:${entry.note.voice}:${entry.note.beat}`;
    const chord = chords.get(key) ?? [];
    chord.push(entry);
    chords.set(key, chord);
  }
  return [...chords.values()];
}

export function readBarFermatas(glyphs: readonly PdfGlyph[], notes: readonly TimedNote[], space: number): TimedNote[] | null {
  const fermatas = new Map<TimedNote, 'upright' | 'inverted'>();
  const marks = glyphs.filter(isFermataGlyph);
  const consumed = new Set<PdfGlyph>();
  if (!marks.length) return [...notes];
  if (marks.some(glyph => !within(glyph.size, space * 4, space * 0.2))) return null;
  for (const chord of noteChords(notes)) {
    const anchor = chord.find(entry => !entry.note.chord);
    if (!anchor) continue;
    for (const side of [1, -1]) {
      const edge = chord.reduce((outer, entry) => entry.y * side > outer.y * side ? entry : outer);
      const offset = edge.note.duration.value === 'whole' ? 0.36 : 0.61;
      const symbol = side === 1 ? 0xe4c0 : 0xe4c1;
      const stack = marks.filter(glyph => codePoint(glyph) === symbol
        && within(glyph.x, edge.x - space * offset, space * 0.22))
        .map(glyph => ({ glyph, distance: (glyph.y - edge.y) * side }))
        .filter(({ distance }) => distance > 0 && distance < space * (0.76 + 1.58 * (chord.length - 1) + 0.25))
        .sort((a, b) => a.distance - b.distance);
      if (!stack.length) continue;
      if (stack.length !== 1 && stack.length !== chord.length) return null;
      if (stack.some(({ glyph, distance }, index) => consumed.has(glyph)
        || !within(distance, space * (0.76 + index * 1.58), space * 0.25))) return null;
      for (const member of stack.length === 1 ? [anchor] : chord) {
        if (fermatas.has(member)) return null;
        fermatas.set(member, side === 1 ? 'upright' : 'inverted');
      }
      for (const mark of stack) consumed.add(mark.glyph);
    }
  }
  if (consumed.size !== marks.length) return null;
  return notes.map(entry => {
    const fermata = fermatas.get(entry);
    return fermata ? { ...entry, note: { ...entry.note, fermata } } : entry;
  });
}

interface Mark extends PdfPoint {
  readonly kind: Articulation;
  readonly offset: number;
  readonly side: number;
}

interface AttachedMark extends Mark {
  readonly distance: number;
}

/** Attach each mark to exactly one staff, voice and onset. Vector dots supplied
 * here have already been excluded from the duration-dot candidates. */
export function readBarArticulations(glyphs: readonly PdfGlyph[], vectorDots: readonly PdfPoint[],
  notes: readonly TimedNote[], space: number,
): TimedNote[] | null {
  const marks: Mark[] = vectorDots.map(dot => ({ ...dot, kind: 'staccato', offset: 0.63, side: 0 }));
  for (const glyph of glyphs.filter(isArticulationGlyph)) {
    if (!within(glyph.size, space * 4, space * 0.2)) return null;
    marks.push({ ...glyph, ...glyphKind(glyph)!, side: codePoint(glyph) % 2 === 0 ? 1 : -1 });
  }
  if (!marks.length) return [...notes];

  const chords = noteChords(notes);

  const attached = new Map<TimedNote, AttachedMark[]>();
  for (const mark of marks) {
    const candidates = [];
    for (const chord of chords) {
      const anchor = chord.find(entry => !entry.note.chord);
      if (!anchor) continue;
      for (const side of mark.side ? [mark.side] : [1, -1]) {
        const edge = chord.reduce((outer, entry) => entry.y * side > outer.y * side ? entry : outer);
        const distance = (mark.y - edge.y) * side;
        if (distance < space * 0.45 || distance > space * 2.25
          || !within(mark.x, edge.x + mark.offset * space, space * 0.28)) continue;
        candidates.push({ anchor, side, distance });
      }
    }
    if (candidates.length !== 1) return null;
    const { anchor, side, distance } = candidates[0]!;
    const previous = attached.get(anchor) ?? [];
    if (previous.some(existing => existing.side !== side
      || (existing.kind === mark.kind && within(existing.distance, distance, space * 0.24)))) return null;
    previous.push({ ...mark, side, distance });
    attached.set(anchor, previous);
  }

  // A repeated symbol printed in a stack can represent the same mark on
  // every note of a chord. Require one mark per head before consuming it.
  for (const chord of chords) {
    const anchor = chord.find(entry => !entry.note.chord);
    const stack = anchor && attached.get(anchor);
    if (!stack) continue;
    const kind = stack[0]!.kind;
    if (new Set(stack.map(mark => mark.kind)).size === stack.length) continue;
    if (stack.length !== chord.length || stack.some(mark => mark.kind !== kind)) return null;
    for (const member of chord) attached.set(member, [stack[0]!]);
  }

  return notes.map(entry => {
    const stack = attached.get(entry);
    if (!stack) return entry;
    const articulations = stack.sort((a, b) => a.distance - b.distance).map(mark => mark.kind);
    // Bravura prints detached legato as a dot and a tenuto dash.
    const portato = articulations.indexOf('staccato');
    if (portato >= 0 && articulations[portato + 1] === 'tenuto') articulations.splice(portato, 2, 'portato');
    return { ...entry, note: { ...entry.note, articulations } };
  });
}
