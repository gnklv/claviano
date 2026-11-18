import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { roundDotCenter } from '../src/infrastructure/parsers/pdf/curves';
import { readPdf } from '../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../src/infrastructure/parsers/pdf/geometry';
import { codePoint, pianoStaffPairs } from '../src/infrastructure/parsers/pdf/pianoGeometry';
import { durationDotCandidates, readEvents, readVoice, validStemGroups } from '../src/infrastructure/parsers/pdf/pianoNotes';

function fixture() {
  const pdf = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const geometry = extractPdfGeometry(pdf.page(1));
  const measure = pianoStaffPairs(geometry.segments)[0];
  const [upper, lower] = measure.staves;
  const middle = upper.bottom - upper.space * 3;
  const inside = (p: { x: number; y: number }) => p.x > measure.left && p.x < measure.right
    && p.y > lower.bottom - 4 * upper.space && p.y < upper.bottom + 5 * upper.space;
  const symbols = geometry.glyphs.filter(g => inside(g) && [0xe0a3, 0xe0a4, 0xe261].includes(codePoint(g)));
  const dots = geometry.curvedFills.flatMap(contour => {
    const dot = roundDotCenter(contour, upper.space);
    return dot && inside(dot) && durationDotCandidates(dot, symbols, upper.space).length ? [dot] : [];
  });
  const bar = { start: 0, length: 4, navigation: {} };
  const read = (i: number, augmentation = dots) => {
    const staff = measure.staves[i];
    const glyphs = symbols.filter(g => (g.y > middle) === (i === 0));
    const events = readEvents(glyphs, staff, geometry.segments, [], augmentation.filter(dot => durationDotCandidates(dot, glyphs, staff.space).length), true);
    if (!events || !validStemGroups(events, staff.space)) return null;
    return readVoice(events, glyphs, bar, 0, staff, i + 1, i === 0 ? 'treble' : 'bass', 2, i === 0 ? '1' : '5');
  };
  return { read, dots };
}

test('reads stemmed chords with displaced seconds and aligns their attack columns', () => {
  const { read, dots } = fixture();
  const upper = read(0);
  const lower = read(1);
  expect(dots).toHaveLength(3);
  expect(upper?.notes.map(({ note }) => [note.sounding, note.beat, note.beats, note.chord, note.stem])).toEqual([
    [69, 0, 3, false, 'up'], [71, 0, 3, true, 'up'], [74, 0, 3, true, 'up'],
    [76, 3, 1, false, 'down'], [78, 3, 1, true, 'down'], [79, 3, 1, true, 'down'],
  ]);
  expect(lower?.notes.map(({ note }) => [note.sounding, note.beat, note.beats, note.chord, note.stem, note.accidental])).toEqual([
    [50, 0, 2, false, 'up', null], [52, 0, 2, true, 'up', null], [57, 0, 2, true, 'up', null],
    [35, 2, 2, false, 'down', null], [36, 2, 2, true, 'down', 'natural'],
  ]);
  for (const [result, shifted] of [[upper, [1, 4]], [lower, [1, 3]]] as const) {
    for (const index of shifted) {
      const entry = result!.notes[index];
      const aligned = result!.notes.find(note => note.note.beat === entry.note.beat && note.columnX === undefined);
      expect(entry.columnX).toBe(aligned?.x);
      expect(entry.x).not.toBe(entry.columnX);
    }
  }
});

test('rejects a displaced chord whose duration dots are incomplete', () => {
  const { read, dots } = fixture();
  expect(read(0, dots.slice(1))).toBeNull();
});
