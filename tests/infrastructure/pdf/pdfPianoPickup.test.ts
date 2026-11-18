// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { WrittenNote, WrittenRest } from '../../../src/domain/notation/written';
import { readPdf, type PdfContent } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { pianoStaffPairs, top } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { readPickup, readPickupPreview } from '../../../src/infrastructure/parsers/pdf/pianoPickup';
import { readPianoDocumentPreview, readPianoPreview } from '../../../src/infrastructure/parsers/pdf/pianoPreview';
import { writePdfPreviewMusicXml } from '../../../src/infrastructure/writers/pdfPreviewMusicXml';
import { bytes, parser } from '../../support/musicXmlScore';

const page = () => readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0);

const noteData = ({ bar, staff, sounding, pitch, beat, beats, duration, beams, accidental, clef,
  chord, tuplet, tupletStart, tupletStop, tieStart, tieStop, articulations, fermata, ornaments, trillLine, tremolo, arpeggio, slurs }: WrittenNote) =>
  ({ bar, staff, sounding, pitch, beat, beats, duration, beams, accidental, clef,
    chord, tuplet, tupletStart, tupletStop, tieStart, tieStop, articulations, fermata, ornaments, trillLine, tremolo, arpeggio, slurs: slurs.map(({ type, number }) => ({ type, number })) });
const restData = ({ staff, beat, duration, clef, measure, displayPitch }: WrittenRest) =>
  ({ staff, beat, duration, clef, measure, displayPitch });

test('reads and reopens all 36 bars of the engraved showcase', () => {
  const result = readPianoDocumentPreview(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')), 'Showcase');
  expect(result?.coverage).toBe('full');
  expect(result?.issues).toEqual([{ kind: 'ambiguous-pedal', bar: 18, staff: 2, start: 66, end: 70 }]);
  const preview = result?.notation;
  expect(preview).not.toBeNull();
  if (!preview) return;

  const source = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'Showcase');
  const reference = source.notation;
  const bars = reference.bars.map((bar, index) => index === 30
    ? { ...bar, navigation: { ...bar.navigation, endingLabel: '2' } } : bar);
  expect(preview.bars).toEqual(bars);
  expect(preview.notes).toHaveLength(263);
  expect(preview.clefs).toEqual(reference.clefs);
  expect(preview.timeSignatures).toEqual(reference.timeSignatures);
  expect(preview.keySignatures).toEqual(reference.keySignatures);
  expect(preview.words).toEqual(reference.words);
  const hairpins = reference.hairpins;
  expect(preview.hairpins).toEqual(hairpins);
  expect(preview.tempoMarks).toMatchObject([{ beat: 37, perMinute: 60, unit: { value: 'quarter', dots: 1 } }]);
  expect(preview.tempos).toMatchObject([{ beat: 37, bpm: 90 }]);
  const octaveShifts = reference.octaveShifts;
  const pedalMarks = reference.pedalMarks.filter(({ beat, pedal }) => !(pedal === 'sostenuto' && (beat === 66 || beat === 70)))
    .map(mark => mark.pedal === 'sustain' && (mark.beat === 122 || mark.beat === 126) ? { ...mark, sign: false } : mark);
  const pedalMoves = reference.pedalMoves.filter(({ pedal, beat }) => !(pedal === 'sostenuto' && (beat === 66 || beat === 70)));
  const printedDynamics = (marks: typeof reference.dynamics) => marks
    .map(({ beat, below, letters, text }) => ({ beat, below, letters, text }));
  const dynamics = printedDynamics(reference.dynamics);
  expect(preview.octaveShifts).toEqual(octaveShifts);
  expect(preview.pedalMarks).toEqual(pedalMarks);
  expect(preview.pedalMoves).toEqual(pedalMoves);
  expect(printedDynamics(preview.dynamics)).toEqual(dynamics);
  const notes = reference.notes.map(noteData);
  const rests = reference.rests.map(restData);
  expect(preview.notes.map(noteData)).toEqual(notes);
  expect(preview.rests.map(restData)).toEqual(rests);

  const score = parser.parse(bytes(writePdfPreviewMusicXml(preview)), 'Showcase');
  const played = (piece: typeof score) => piece.notes
    .map(({ pitch, beat, beats, hand }) => ({ pitch, beat, beats, hand }));
  expect(score.barWritten).toEqual(source.barWritten);
  expect(played(score)).toEqual(played(source));
  const reopened = score.notation;
  const graces = reference.graces;
  expect(preview.graces).toEqual(graces);
  expect(reopened.graces).toEqual(graces);
  expect(reopened.bars).toEqual(preview.bars);
  expect(reopened.notes.map(noteData)).toEqual(notes);
  expect(reopened.rests.map(restData)).toEqual(rests);
  expect(reopened.hairpins).toEqual(hairpins);
  expect(reopened.notes.flatMap(note => note.slurs.filter(mark => mark.type === 'start')
    .map(mark => [note.bar, note.staff, mark.placement]))).toEqual([[15, 1, 'above'], [15, 2, 'below']]);
  expect(reopened.octaveShifts).toEqual(octaveShifts);
  expect(reopened.pedalMarks).toEqual(pedalMarks);
  expect(reopened.pedalMoves).toEqual(pedalMoves);
  expect(printedDynamics(reopened.dynamics)).toEqual(dynamics);
  expect(reopened.tempos).toEqual(preview.tempos);
  expect(reopened.tempoMarks).toEqual([{ beat: 37, perMinute: 60, unit: { value: 'quarter', dots: 1 } }]);
  expect(reopened.notes.map(note => note.stem)).toEqual(preview.notes.map(note => note.stem));
  expect(reopened.rests.slice(0, 2)).toMatchObject([
    { staff: 2, beat: 0, duration: { value: 'quarter', dots: 0 }, measure: false },
    { staff: 2, beat: 8, duration: { value: 'quarter', dots: 0 }, measure: false },
  ]);
});

function changeGlyph(content: PdfContent, from: string, to: string): PdfContent {
  return {
    ...content,
    fonts: new Map([...content.fonts].map(([name, font]) => [name, {
      ...font,
      unicode: new Map([...font.unicode].map(([code, glyph]) => [code, glyph === from ? to : glyph])),
    }])),
    form(name) {
      const child = content.form(name);
      return child && changeGlyph(child, from, to);
    },
  };
}

test('declines a pickup when its printed rest and note durations disagree', () => {
  const altered = changeGlyph(page(), '\ue4e5', '\ue4e4');
  expect(extractPdfGeometry(altered).glyphs.some(({ text }) => text === '\ue4e5')).toBe(false);
  expect(readPianoPreview(altered, 'Conflicting pickup')).toBeNull();
});

test('stops the preview at the pickup when the first full bar loses its augmentation dot', () => {
  const geometry = extractPdfGeometry(page());
  const [, fullBar] = pianoStaffPairs(geometry.segments);
  const [upper] = fullBar.staves;
  const curvedFills = geometry.curvedFills.filter(contour => !contour.every(({ from: { x, y } }) =>
    x > fullBar.left && x < fullBar.right && y > top(upper) && y < top(upper) + upper.space * 4));
  expect(curvedFills).toHaveLength(geometry.curvedFills.length - 1);
  expect(readPickup(geometry, 'Showcase')?.bars).toHaveLength(19);
  expect(readPickup({ ...geometry, curvedFills }, 'Missing augmentation dot')?.bars).toEqual([
    { start: 0, length: 1, navigation: {} },
  ]);
});

test.each(['reversed', 'duplicated'])('keeps only the pickup with a %s eighth-note flag', variant => {
  const geometry = extractPdfGeometry(page());
  const [, bar] = pianoStaffPairs(geometry.segments);
  const flag = geometry.glyphs.find(g => g.x > bar.left && g.x < bar.right
    && g.y > bar.staves[0].bottom && g.text === '\ue241')!;
  expect(flag).toBeDefined();
  const glyphs = variant === 'duplicated' ? [...geometry.glyphs, { ...flag }]
    : geometry.glyphs.map(g => g === flag ? { ...g, text: '\ue240' } : g);
  expect(readPickup({ ...geometry, glyphs }, 'Flag')?.bars).toHaveLength(1);
});

test('keeps only the pickup when a single-voice stem does not touch its head', () => {
  const geometry = extractPdfGeometry(page());
  const [, bar] = pianoStaffPairs(geometry.segments);
  const staff = bar.staves[0];
  const head = geometry.glyphs.find(g => g.x > bar.left && g.x < bar.right
    && g.y > top(staff) && g.text === '\ue0a3')!;
  const stem = geometry.segments.find(line => Math.abs(line.x1 - head.x) < staff.space * 0.15
    && Math.abs(line.x1 - line.x2) < 0.04 && Math.abs(line.y1 - head.y) < staff.space * 0.35)!;
  expect(stem).toBeDefined();
  const segments = geometry.segments.map(line => line === stem ? { ...stem, y1: head.y - staff.space } : line);
  expect(readPickup({ ...geometry, segments }, 'Detached stem')?.bars).toHaveLength(1);
});

test.each(['Times-Italic', 'Times-Bold', 'Times-Roman'])('keeps only the pickup with an unhandled %s direction', font => {
  const geometry = extractPdfGeometry(page());
  const [, bar] = pianoStaffPairs(geometry.segments);
  const staff = bar.staves[0];
  const text = { x: (bar.left + bar.right) / 2, y: top(staff) + staff.space * 3,
    font, text: 'p', code: 112, size: staff.space * 2 };
  expect(readPickup({ ...geometry, glyphs: [...geometry.glyphs, text] }, 'Later direction')?.bars).toHaveLength(1);
});

test('keeps the preceding bars when bar 2 loses its bass rest', () => {
  const geometry = extractPdfGeometry(page());
  const [, , bar] = pianoStaffPairs(geometry.segments);
  const rest = geometry.glyphs.find(g => g.x > bar.left && g.x < bar.right
    && g.y < bar.staves[0].bottom && g.text === '\ue4e5');
  expect(rest).toBeDefined();
  const glyphs = geometry.glyphs.filter(g => g !== rest);
  const original = readPickup(geometry, 'Showcase')!;
  const shortened = readPickup({ ...geometry, glyphs }, 'Missing bass rest');
  expect(original.bars).toHaveLength(19);
  expect(shortened).toMatchObject({
    bars: original.bars.slice(0, 2),
    notes: original.notes.filter(note => note.bar < 2),
    rests: original.rests.filter(rest => rest.beat < 5),
  });
});

test('stops before a crescendo that has no rhythmic anchor', () => {
  const geometry = extractPdfGeometry(page());
  const bar = pianoStaffPairs(geometry.segments)[2];
  const [upper, lower] = bar.staves;
  const y = (upper.bottom + top(lower)) / 2;
  const wedge = [-1, 1].map(direction => ({
    x1: bar.left + upper.space * 2, x2: bar.right - upper.space,
    y1: y, y2: y + direction * upper.space * 0.5, width: upper.space * 0.1,
  }));
  const preview = readPickup({ ...geometry, segments: [...geometry.segments, ...wedge] }, 'Crescendo');
  expect(preview?.bars).toHaveLength(2);
});

test('reads an unnumbered system and rejects a contradictory printed number', () => {
  const geometry = extractPdfGeometry(page());
  const system = pianoStaffPairs(geometry.segments)[3];
  const [upper] = system.staves;
  const number = geometry.glyphs.find(g => g.text === '3' && Math.abs(g.x - system.left) < upper.space * 1.5
    && g.y > top(upper) + upper.space * 2 && g.y < top(upper) + upper.space * 5);
  expect(number).toBeDefined();
  const glyphs = geometry.glyphs.filter(g => g !== number);
  const original = readPickup(geometry, 'Showcase');
  expect(original?.bars).toHaveLength(19);
  expect(readPickup({ ...geometry, glyphs }, 'Missing system number')?.bars).toEqual(original?.bars);
  const wrong = [...glyphs, { ...number!, text: '7' }];
  expect(readPickup({ ...geometry, glyphs: wrong }, 'Wrong number')?.bars).toEqual(original?.bars.slice(0, 3));
});

test.each([
  { bar: 21, code: 0xe59e, mark: 'trill' },
  { bar: 22, code: 0xeaad, mark: 'arpeggio' },
])('stops before bar $bar when the $mark line loses its terminal glyph', ({ bar, code }) => {
  const doc = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const first = extractPdfGeometry(doc.page(0));
  const second = extractPdfGeometry(doc.page(1));
  const measure = pianoStaffPairs(second.segments)[bar - pianoStaffPairs(first.segments).length];
  const [upper, lower] = measure.staves;
  const glyphs = second.glyphs.filter(g => !(g.text.codePointAt(0) === code
    && g.x > measure.left && g.x < measure.right && g.y > lower.bottom - lower.space * 5
    && g.y < top(upper) + upper.space * 6));
  expect(glyphs).toHaveLength(second.glyphs.length - 1);
  const result = readPickupPreview(first, 'Incomplete marking', [{ ...second, glyphs }]);
  expect(result?.notation.bars).toHaveLength(bar);
});

test('keeps the preceding music when the closing double barline loses one stroke', () => {
  const doc = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const first = extractPdfGeometry(doc.page(0));
  const second = extractPdfGeometry(doc.page(1));
  const measure = pianoStaffPairs(second.segments).at(-1)!;
  const upper = measure.staves[0];
  const segments = second.segments.filter(s => !(Math.abs(s.x1 - s.x2) < 0.04
    && Math.abs(measure.right - s.x1 - upper.space * 0.97) < upper.space * 0.12
    && Math.abs(Math.max(s.y1, s.y2) - top(upper)) < 0.04));
  expect(segments).toHaveLength(second.segments.length - 1);
  expect(readPickupPreview(first, 'Incomplete final barline', [{ ...second, segments }])?.notation.bars).toHaveLength(35);
});

test('keeps the first page and its pedal diagnostic when the next page number disagrees', () => {
  const doc = readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf'));
  const first = extractPdfGeometry(doc.page(0));
  const second = extractPdfGeometry(doc.page(1));
  const [system] = pianoStaffPairs(second.segments);
  const upper = system.staves[0];
  const glyphs = second.glyphs.map(g => g.text === '9' && Math.abs(g.x - system.left) < upper.space * 1.5
    && g.y > top(upper) + upper.space * 2 && g.y < top(upper) + upper.space * 5 ? { ...g, text: '8' } : g);
  expect(glyphs).not.toEqual(second.glyphs);
  const preview = readPickupPreview(first, 'Wrong page', [{ ...second, glyphs }]);
  expect(preview?.notation.bars).toHaveLength(19);
  expect(preview?.issues).toEqual([{ kind: 'ambiguous-pedal', bar: 18, staff: 2, start: 66, end: 70 }]);
});

test('stops at the system boundary when a possible new key precedes the first note', () => {
  const geometry = extractPdfGeometry(page());
  const measure = pianoStaffPairs(geometry.segments)[3];
  const staff = measure.staves[0];
  const first = geometry.glyphs.find(g => g.text === '\ue0a4' && g.x > measure.left && g.x < measure.right
    && Math.abs(g.y - staff.bottom - 2.5 * staff.space) < 0.04)!;
  const sharp = { ...first, text: '\ue262', x: first.x - staff.space * 1.25 };
  expect(readPickup({ ...geometry, glyphs: [...geometry.glyphs, sharp] }, 'Changed key')?.bars).toHaveLength(3);
});

test('keeps the last complete system when a tied chord cannot be resolved across the barline', () => {
  const geometry = extractPdfGeometry(page());
  const measure = pianoStaffPairs(geometry.segments)[9];
  const target = geometry.glyphs.find(g => g.text === '\ue0a2' && g.x > measure.left && g.x < measure.right
    && Math.abs(g.y - measure.staves[1].bottom) < measure.staves[1].space * 2);
  expect(target).toBeDefined();
  const truncated = readPickup({ ...geometry, glyphs: geometry.glyphs.filter(g => g !== target) }, 'Unresolved tie');
  expect(truncated?.bars).toHaveLength(8);
  expect(truncated?.notes.some(n => n.tieStart || n.tieStop)).toBe(false);
});

test('keeps the previous complete bar when the bass slur loses its continuation on the next system', () => {
  const geometry = extractPdfGeometry(page());
  const measure = pianoStaffPairs(geometry.segments)[16];
  const staff = measure.staves[1];
  const curvedFills = geometry.curvedFills.filter(contour => !contour.every(({ from }) =>
    from.x > measure.left && from.x < measure.right && Math.abs(from.y - staff.bottom) < 3 * staff.space));
  expect(curvedFills).toHaveLength(geometry.curvedFills.length - 1);
  const fragment = readPickup({ ...geometry, curvedFills }, 'Incomplete bass slur');
  expect(fragment?.bars).toHaveLength(15);
  expect(fragment?.notes.some(note => note.slurs.length)).toBe(false);
});
