// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry, type PdfPoint } from '../src/infrastructure/parsers/pdf/geometry';
import { isHead, pianoStaffPairs, pitchAt, top } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { readBarTies } from '../src/infrastructure/parsers/pdf/pianoTies';
import { bytes, parser } from './musicXmlScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
const measures = pianoStaffPairs(geometry.segments);
const reference = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'Showcase').notation;

function inputs(index: number) {
  const measure = measures[index];
  const [upper, lower] = measure.staves;
  const inside = (p: PdfPoint) => p.x > measure.left && p.x < measure.right
    && p.y > lower.bottom - 5 * lower.space && p.y < top(upper) + 6 * upper.space;
  const heads = geometry.glyphs.filter(head => isHead(head) && inside(head));
  const expected = reference.notes.filter(note => note.bar === index);
  const positioned = expected.map(note => {
    const staff = measure.staves[note.staff - 1];
    const candidates = heads.filter(head => {
      const pitch = pitchAt(head.y, staff, note.clef);
      return pitch?.octave === note.pitch.octave && pitch.letter === note.pitch.letter
        && (head.y > (upper.bottom + top(lower)) / 2) === (note.staff === 1);
    }).sort((a, b) => a.x - b.x);
    const earlier = expected.filter(other => other.staff === note.staff && other.sounding === note.sounding
      && other.beat < note.beat).length;
    const head = candidates[earlier];
    return { x: head.x, y: head.y, note: { ...note, tieStart: false, tieStop: false, slurs: [] } };
  });
  const curves = geometry.curvedFills.filter(c => c.some(edge => inside(edge.from) || inside(edge.to)));
  return { measure, bar: reference.bars[index], positioned, curves, expected };
}

test('reads the internal half-note tie and verifies three cross-bar ties against their destination heads', () => {
  const a = inputs(8), b = inputs(9);
  const first = readBarTies(a.curves, a.measure, a.bar, a.positioned, []);
  expect(first?.notes).toEqual(a.expected);
  expect(first?.pending).toHaveLength(3);
  const next = readBarTies(b.curves, b.measure, b.bar, b.positioned, first!.pending);
  expect(next).toEqual({ notes: b.expected, pending: [] });

  expect(readBarTies(b.curves.slice(1), b.measure, b.bar, b.positioned, first!.pending)).toBeNull();
  expect(readBarTies(b.curves, b.measure, b.bar, b.positioned.slice(1), first!.pending)).toBeNull();
  expect(readBarTies(b.curves, b.measure, b.bar, b.positioned, [])).toBeNull();
  const differentVoice = b.positioned.map(p => ({ ...p, note: { ...p.note, voice: '7' } }));
  expect(readBarTies(b.curves, b.measure, b.bar, differentVoice, first!.pending)).toBeNull();
});


test('validates both phrase endpoints, including the continuation on a new system', () => {
  const a = inputs(15), b = inputs(16);
  const first = readBarTies(a.curves, a.measure, a.bar, a.positioned, [], b.measure);
  const expectedStarts = a.expected.map(note => ({ ...note, slurs: note.slurs.map(mark =>
    mark.type === 'start' ? { ...mark, placement: note.staff === 1 ? 'above' : 'below' } : mark) }));
  expect(first?.notes).toEqual(expectedStarts);
  expect(first?.pending).toHaveLength(1);
  expect(readBarTies(b.curves, b.measure, b.bar, b.positioned, first!.pending))
    .toEqual({ notes: b.expected, pending: [] });
  expect(readBarTies(a.curves, a.measure, a.bar, a.positioned, [])).toBeNull();
  expect(readBarTies([], b.measure, b.bar, b.positioned, first!.pending)).toBeNull();
  expect(readBarTies(b.curves, b.measure, b.bar, b.positioned, [])).toBeNull();
  // Reassign the second phrase to an already active staff and number.
  const overlapping = a.positioned.map(entry => entry.note.staff === 2
    ? { ...entry, note: { ...entry.note, staff: 1, voice: '1' } } : entry);
  expect(readBarTies(a.curves, a.measure, a.bar, overlapping, [], b.measure)).toBeNull();
  const reversed = a.positioned.map(entry => entry.note.staff === 1 && entry.note.beat === a.bar.start
    ? { ...entry, note: { ...entry.note, beat: a.bar.start + 2 } } : entry);
  expect(readBarTies(a.curves, a.measure, a.bar, reversed, [], b.measure)).toBeNull();
  const displaced = b.positioned.map(entry => ({ ...entry, y: entry.y + b.measure.staves[0].space }));
  expect(readBarTies(b.curves, b.measure, b.bar, displaced, first!.pending)).toBeNull();
});
