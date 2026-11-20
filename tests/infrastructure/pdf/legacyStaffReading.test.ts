import { expect, test } from 'vitest';
import { applyPdfCurves } from '../../../src/infrastructure/parsers/pdf/curves';
import type { PdfGeometry, PdfGlyph } from '../../../src/infrastructure/parsers/pdf/geometry';
import { readStaff, type Onset, type PlacedNote } from '../../../src/infrastructure/parsers/pdf/legacyStaff';
import type { WrittenRest } from '../../../src/domain/notation/written';
import { strips } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';


const music = (text: string, x: number, y: number): PdfGlyph => ({ text, x, y, size: 20, code: 1, font: 'MScore' });
const line = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, width: 0.5 });

function read(geometry: PdfGeometry, length: number) {
  const notes: PlacedNote[] = [], rests: WrittenRest[] = [], onsets: Onset[] = [];
  const ok = readStaff(geometry, geometry.glyphs.filter(g => g.font === 'MScore'), { bottom: 100, space: 5 },
    'treble', 0, { start: 0, length, navigation: {} }, 0, 1, [], notes, rests, onsets, true);
  return { ok, notes: notes.map(n => n.note), rests };
}

test('reads a centered full-bar rest with the duration of its triple meter', () => {
  const result = read({
    glyphs: [music('\ue100', 55, 115)], segments: [], fills: [], curvedFills: [],
  }, 3);
  expect(result.ok).toBe(true);
  expect(result.rests).toEqual([expect.objectContaining({
    beat: 0, measure: true, duration: { value: 'half', dots: 1 },
  })]);
});

test('reads a displaced second as one dotted stemless chord', () => {
  const geometry: PdfGeometry = { glyphs: [music('\ue12b', 40, 100), music('\ue12b', 49.25, 102.5),
    music('\ue12b', 49.25, 110), music('\ue127', 61, 112.5)], segments: [], fills: [], curvedFills: [] };
  const result = read(geometry, 6);
  expect(result.ok).toBe(true);
  expect(result.notes.map(n => [n.beat, n.beats, n.chord, n.stem])).toEqual([
    [0, 6, false, null], [0, 6, true, null], [0, 6, true, null],
  ]);
});

test('reads one split triplet bracket spanning three unflagged quarter chords', () => {
  const geometry: PdfGeometry = { glyphs: [40, 55, 70].flatMap(x => [music('\ue12d', x, 100), music('\ue12d', x, 105)]).concat(
    { ...music('3', 55, 125), font: 'FreeSerifItalic' }), segments: [
    ...[40, 55, 70].map(x => line(x + 6.25, 100, x + 6.25, 118)), line(40, 128.5, 52.5, 128.5),
    line(62.5, 128.5, 75, 128.5)], fills: [], curvedFills: [] };
  const result = read(geometry, 2);
  expect(result.ok).toBe(true);
  expect(result.notes.map(n => n.beat)).toEqual([0, 0, 2 / 3, 2 / 3, 4 / 3, 4 / 3]);
  expect(result.notes[0]?.tupletStart).toEqual({ showNumber: true, bracket: true });
  expect(result.notes.map(n => !!n.tupletStart)).toEqual([true, false, false, false, false, false]);
  expect(result.notes.map(n => n.tupletStop)).toEqual([false, false, false, false, true, false]);
  expect(result.notes.map(n => n.tuplet)).toEqual(Array.from({ length: 6 }, () => ({ actual: 3, normal: 2 })));
});

test('reads a numbered quadruplet grouped by a secondary beam', () => {
  const heads = [25, 40, 55, 70, 85, 100];
  const beam = (left: number, right: number, y: number) => [
    { x: left, y }, { x: left, y: y + 2.5 }, { x: right, y: y + 2.5 }, { x: right, y },
  ];
  const geometry: PdfGeometry = {
    glyphs: [...heads.map(x => music('\ue12d', x, 100)), { ...music('4', 65.5, 125), font: 'FreeSerifItalic' }],
    segments: heads.map(x => line(x + 6.25, 100, x + 6.25, 118)),
    fills: [beam(31.25, 106.25, 116.75), beam(46.25, 91.25, 113.15)],
    curvedFills: [],
  };
  const notes: PlacedNote[] = [];
  expect(readStaff(geometry, geometry.glyphs, { bottom: 100, space: 5 }, 'treble', 0,
    { start: 0, length: 1.75, navigation: {} }, 0, 1, strips(geometry.fills, 5), notes, [], [], true)).toBe(true);
  expect(notes.map(({ note }) => note.beats)).toEqual([0.5, 0.1875, 0.1875, 0.1875, 0.1875, 0.5]);
  expect(notes[1]?.note).toMatchObject({ tuplet: { actual: 4, normal: 3 },
    tupletStart: { showNumber: true, bracket: false }, beams: ['continue', 'begin'] });
  expect(notes[4]?.note).toMatchObject({ tupletStop: true, beams: ['continue', 'end'] });
});

test('keeps an alteration over a barline only when a horizontal tie connects the notes', () => {
  const first = read({ glyphs: [music('\ue12b', 40, 100), music('\ue10e', 34, 100)],
    segments: [], fills: [], curvedFills: [] }, 4).notes[0];
  const second = read({ glyphs: [music('\ue12b', 75, 100)], segments: [], fills: [], curvedFills: [] }, 4).notes[0];
  const from = { x: 44, y: 104 }, to = { x: 78, y: 104 };
  const control1 = { x: 52, y: 107 }, control2 = { x: 66, y: 107 };
  const notes = [{ x: 40, y: 100, note: first }, { x: 75, y: 100, note: { ...second, beat: 4, bar: 1 } }];
  const geometry: PdfGeometry = { glyphs: [], segments: [], fills: [], curvedFills: [[
    { from, to, control1, control2 }, { from: to, to: from, control1: control2, control2: control1 },
  ]] };
  expect(applyPdfCurves(geometry, notes, 5, true)[1]).toMatchObject({ pitch: first.pitch, tieStop: true });
  expect(applyPdfCurves({ ...geometry, curvedFills: [] }, notes, 5, true)[1]).toMatchObject({ pitch: second.pitch, tieStop: false });
});

test('reads centered diagonal stem strokes as a single tremolo on the first chord head', () => {
  const slash = (y: number) => [{ x: 43.25, y }, { x: 49.25, y: y + 2.5 },
    { x: 49.25, y }, { x: 43.25, y: y - 2.5 }, { x: 43.25, y }];
  const geometry: PdfGeometry = {
    glyphs: [music('\ue12c', 40, 100), music('\ue12c', 40, 105)],
    segments: [line(46.25, 100, 46.25, 125)], fills: [slash(121.25), slash(117.25)], curvedFills: [],
  };
  const notes: PlacedNote[] = [];
  expect(readStaff(geometry, geometry.glyphs, { bottom: 100, space: 5 }, 'treble', 0,
    { start: 0, length: 2, navigation: {} }, 0, 1, strips(geometry.fills, 5, 1), notes, [], [], true)).toBe(true);
  expect(notes.map(({ note }) => [note.duration.value, note.beams, note.tremolo])).toEqual([
    ['half', [], { type: 'single', strokes: 2 }], ['half', [], null],
  ]);
});

test('assigns superimposed unison heads to their two printed stems', () => {
  const result = read({
    glyphs: [music('\ue12c', 40, 100), music('\ue12c', 40, 100)],
    segments: [line(46.25, 100, 46.25, 118), line(40.25, 100, 40.25, 82)],
    fills: [], curvedFills: [],
  }, 2);
  expect(result.ok).toBe(true);
  expect(result.notes.map(n => [n.voice, n.beat, n.stem, n.chord])).toEqual([
    ['1', 0, 'up', false], ['2', 0, 'down', false],
  ]);
});

test('recovers a displaced rest position in the clef active at the rest', () => {
  const rest = music('\ue109', 60, 117.8);
  const geometry = { glyphs: [rest], segments: [], fills: [], curvedFills: [] };
  const rests: WrittenRest[] = [];
  expect(readStaff(geometry, geometry.glyphs, { bottom: 100, space: 5 }, 'treble', 0,
    { start: 0, length: 0.5, navigation: {} }, 0, 1, [], [], rests, [], true, [{ x: 40, clef: 'bass' }])).toBe(true);
  expect(rests).toEqual([expect.objectContaining({
    clef: 'bass', displayPitch: { letter: 5, octave: 3 },
  })]);
});

test('recognizes the default anchors of concurrent whole-bar rests', () => {
  const { ok, rests } = read({
    glyphs: [music('\ue102', 55, 125), music('\ue100', 55, 100)], segments: [], fills: [], curvedFills: [],
  }, 6);
  expect(ok).toBe(true);
  expect(rests).toHaveLength(2);
  expect(rests).toMatchObject([
    { voice: '1', measure: true, displayPitch: null },
    { voice: '2', measure: true, displayPitch: null },
  ]);
});

test('keeps the tuplet ratio and stop on a rest ending a bracket', () => {
  const { ok, rests } = read({
    glyphs: [music('\ue12d', 40, 100), music('\ue12d', 55, 100), music('\ue107', 70, 110),
      { ...music('3', 55, 125), font: 'FreeSerifItalic' }],
    segments: [line(46.25, 100, 46.25, 118), line(61.25, 100, 61.25, 118),
      line(40, 128.5, 52.5, 128.5), line(62.5, 128.5, 75, 128.5)],
    fills: [], curvedFills: [],
  }, 2);
  expect(ok).toBe(true);
  expect(rests).toEqual([expect.objectContaining({
    beat: 4 / 3, duration: { value: 'quarter', dots: 0 }, tuplet: { actual: 3, normal: 2 }, tupletStop: true,
  })]);
});
