// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { performanceOrder } from '../../../src/domain/notation/navigation';
import { readBarNavigation } from '../../../src/infrastructure/parsers/pdf/pianoNavigation';
import { dynamicsAlongPage } from '../../../src/domain/notation/dynamics';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { applyMuseScoreDirections } from '../../../src/infrastructure/parsers/pdf/museScoreDirections';
import { readBarDirections } from '../../../src/infrastructure/parsers/pdf/pianoDirections';
import { codePoint, isHead, pianoStaffPairs, sortedX, top } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { bytes, parser } from '../../support/musicXmlScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
const measures = pianoStaffPairs(geometry.segments);
const reference = parser.parse(bytes(readFileSync('public/demos/showcase.musicxml', 'utf8')), 'Showcase').notation;

function inputs(index: number) {
  const measure = measures[index];
  const bar = reference.bars[index];
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  const heads = sortedX(geometry.glyphs.filter(glyph => isHead(glyph) && glyph.x > measure.left
    && glyph.x < measure.right && glyph.y > middle && glyph.y < top(upper) + upper.space * 4));
  const notes = reference.notes.filter(note => note.bar === index && note.staff === 1);
  expect(heads).toHaveLength(notes.length);
  return { measure, bar, columns: heads.map(({ x }, i) => ({ x, beat: notes[i].beat })) };
}

test('reads a bold direction above the staff beside a bold metronome marking', () => {
  const { bar, measure, columns } = inputs(0);
  const [upper] = measure.staves;
  const y = top(upper) + upper.space * 2;
  const x = columns[0].x;
  const size = upper.space * 2.4;
  const printed = [
    ...Array.from('rall.', (text, i) => ({ text, x: x + i * size * 0.4, font: 'Edwin-Bold' })),
    { text: '\ueca5', x: x + size * 2.2, font: 'Leland' },
    ...Array.from('=80', (text, i) => ({ text, x: x + (3 + i * 0.6) * size, font: 'Edwin-Bold' })),
  ].map(glyph => ({ ...glyph, y, size, code: glyph.text.codePointAt(0)! }));
  const result = applyMuseScoreDirections(reference, [{
    geometry: { ...geometry, glyphs: printed }, measure, index: 0, notes: [], columns,
  }]);
  expect(result.words).toEqual([{ beat: bar.start, text: 'rall.', below: false, tempo: false }]);
  expect(result.tempoMarks).toEqual([
    { beat: bar.start, unit: { value: 'quarter', dots: 0 }, perMinute: 80, printed: true },
  ]);
});

test('keeps two painted directions at one position and skips credits in the title text object', () => {
  const { bar, measure, columns } = inputs(0);
  const [upper] = measure.staves;
  const { space } = upper;
  const y = top(upper) + space * 2;
  const x = columns[0].x;
  const textRun = (text: string, baseline: number, size: number, font: string, textObject: number) =>
    Array.from(text, (character, i) => ({
      text: character, x: x + i * size * 0.5, y: baseline, size, font, textObject, code: character.codePointAt(0)!,
    }));
  const result = applyMuseScoreDirections(reference, [{
    geometry: { ...geometry, glyphs: [
      ...textRun('Song', y + space * 6, space * 4, 'FreeSerif', 1),
      ...textRun('Arranger', y, space * 2.4, 'FreeSerif', 1),
      ...textRun('Rit.', y, space * 2.4, 'TimesNewRomanPS-BoldMT', 2),
      ...textRun('Rit.', y, space * 2.4, 'TimesNewRomanPS-BoldMT', 2),
    ] }, measure, index: 0, notes: [], columns,
  }]);
  expect(result.words).toEqual([
    { beat: bar.start, text: 'Rit.', below: false, tempo: true },
    { beat: bar.start, text: 'Rit.', below: false, tempo: true },
  ]);
});

test('reads a large opening direction centered over an entry after a rest', () => {
  const { bar, measure } = inputs(0);
  const [upper] = measure.staves;
  const { space } = upper;
  const glyphs = Array.from('With expression', (text, i) => ({
    text, x: measure.left + i * space, y: top(upper) + space * 3,
    size: space * 2.8, font: 'FreeSerif', code: text.codePointAt(0)!,
  }));
  const columns = [
    { x: measure.left + 4 * space, beat: bar.start },
    { x: measure.left + 8 * space, beat: bar.start + 2 },
    { x: measure.left + 11 * space, beat: bar.start + 3 },
  ];
  const result = applyMuseScoreDirections(reference, [{
    geometry: { ...geometry, glyphs }, measure: { ...measure, right: measure.left + 18 * space },
    index: 0, notes: [], columns,
  }]);
  expect(result.words).toEqual([{ beat: bar.start + 2, text: 'With expression', below: false, tempo: false }]);
});

test('reads the quiet and loud dynamics and the soft and sustain markings from the showcase', () => {
  for (const index of [12, 13]) {
    const { measure, bar, columns } = inputs(index);
    const directions = readBarDirections(geometry, measure, bar, columns, index);
    expect(directions).not.toBeNull();
    const sourceDynamics = reference.dynamics.filter(mark => mark.beat === bar.start);
    expect(directions?.dynamics).toEqual(sourceDynamics.map(({ beat, below, text, letters }) => ({ beat, below, text, letters })));
    expect(dynamicsAlongPage(directions!.dynamics, [], []).levels).toEqual(dynamicsAlongPage(sourceDynamics, [], []).levels);

    const moves = reference.pedalMoves.filter(move => move.bar === index);
    expect(directions?.pedalMoves).toEqual(moves);
    expect(directions?.pedalMarks).toEqual(reference.pedalMarks.filter(mark => moves.some(move =>
      mark.beat === move.beat && mark.pedal === move.pedal)));
    expect(directions?.readText.map(glyph => glyph.text).join('')).toBe(index === 12 ? 'una corda' : 'tre corde');
  }
});

test('requires a printed release to recover a complete sign-only sustain span', () => {
  const { measure, bar, columns } = inputs(13);
  const glyphs = geometry.glyphs.filter(glyph => glyph.text.codePointAt(0) !== 0xe655);
  expect(readBarDirections({ ...geometry, glyphs }, measure, bar, columns, 13)).toBeNull();
});

function lowerStaffColumns(index: number) {
  const measure = measures[index];
  const bar = reference.bars[index];
  const [upper, lower] = measure.staves;
  const middle = (upper.bottom + top(lower)) / 2;
  const events = sortedX(geometry.glyphs.filter(glyph => (isHead(glyph) || [0xe4e4, 0xe4e5].includes(codePoint(glyph)))
    && glyph.x > measure.left && glyph.x < measure.right && glyph.y < middle && glyph.y > lower.bottom - lower.space * 2));
  const beats = [...reference.notes.filter(note => note.bar === index && note.staff === 2),
    ...reference.rests.filter(rest => rest.staff === 2 && rest.beat >= bar.start && rest.beat < bar.start + bar.length)]
    .map(event => event.beat).sort((a, b) => a - b);
  expect(events).toHaveLength(beats.length);
  return { measure, bar, columns: events.map(({ x }, i) => ({ x, beat: beats[i] })) };
}

test('matches printed sustain signs and an unsigned bracket change to the written beats', () => {
  for (const index of [16, 17]) {
    const { measure, bar, columns } = lowerStaffColumns(index);
    const directions = readBarDirections(geometry, measure, bar, columns, index);
    const moves = reference.pedalMoves.filter(move => move.bar === index);
    expect(directions?.pedalMoves).toEqual(moves);
    expect(directions?.pedalMarks).toEqual(reference.pedalMarks.filter(mark => moves.some(move =>
      mark.beat === move.beat && mark.pedal === move.pedal) && (mark.beat !== bar.start || mark.type !== 'stop')
      && (mark.beat !== bar.start + bar.length || mark.type === 'stop')));
    expect(directions?.pedalContinues).toBe(false);
  }
});

test('keeps a bracket pressed across a barline until its printed release', () => {
  const { measure, bar, columns } = lowerStaffColumns(17);
  const boundary = (columns[0].x + columns[1].x) / 2;
  const first = readBarDirections(geometry, { ...measure, right: boundary }, { ...bar, length: 1 }, columns.slice(0, 1), 17);
  expect(first?.pedalMarks).toEqual([{ pedal: 'sustain', beat: bar.start, type: 'start', sign: false, line: true }]);
  expect(first?.pedalContinues).toBe(true);

  const second = readBarDirections(geometry, { ...measure, left: boundary }, { ...bar, start: bar.start + 1, length: 3 },
    columns.slice(1), 18);
  expect(second?.pedalMarks).toEqual([
    { pedal: 'sustain', beat: bar.start + 2, type: 'change', sign: false, line: true },
    { pedal: 'sustain', beat: bar.start + 4, type: 'stop', sign: false, line: true },
  ]);
  expect(second?.pedalContinues).toBe(false);
  expect(second?.pedalFromPrevious).toBe(true);
});

test('does not assign a pedal kind from an ambiguous sostenuto heading above the staff', () => {
  const { measure, bar, columns } = lowerStaffColumns(18);
  const directions = readBarDirections(geometry, measure, bar, columns, 18);
  expect(directions?.pedalMoves).toEqual([]);
  expect(directions?.pedalMarks).toEqual([]);
  expect(directions?.unresolvedPedals).toEqual([
    { staff: 2, bar: 18, start: bar.start, end: bar.start + bar.length, kind: 'ambiguous-pedal' },
  ]);
});

test.each([17, 18])('requires both ticks to reconstruct a pedal bracket in bar index %i', index => {
  const { measure, bar, columns } = lowerStaffColumns(index);
  const { space } = measure.staves[1];
  const fills = geometry.fills.filter(points => !points.every(({ x }) =>
    x < measure.right && x > measure.right - space) || Math.max(...points.map(({ y }) => y))
    - Math.min(...points.map(({ y }) => y)) < space * 0.9);
  expect(fills.length).toBeLessThan(geometry.fills.length);
  expect(readBarDirections({ ...geometry, fills }, measure, bar, columns, index)).toBeNull();
});

test('recovers the printed repeat route and distinguishes open and closed volta hooks', () => {
  const page = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(1));
  const bars = pianoStaffPairs(page.segments).slice(9, 14);
  const navigation = bars.map(measure => {
    const first = Math.min(...page.glyphs.filter(g => isHead(g) && g.x > measure.left && g.x < measure.right
      && g.y > measure.staves[0].bottom && g.y < top(measure.staves[0]) + measure.staves[0].space * 3).map(g => g.x));
    return readBarNavigation(page, measure, first)?.navigation ?? {};
  });
  expect(navigation).toEqual([
    { repeatStart: true, segno: true, segnoSign: true },
    { repeatEnd: { times: 2 }, ending: [1], endingLabel: '1.', endingClosed: true },
    { ending: [2], endingLabel: '2', endingClosed: false, text: 'To Coda', toCoda: true },
    { jump: 'dalsegno', text: 'D.S. al Coda' },
    { coda: true, codaSign: true },
  ]);
  expect(performanceOrder(navigation)).toEqual([0, 1, 0, 2, 3, 0, 2, 4]);
});

test('reads a compact piano dynamic below the lower staff and its neighbouring change of level', () => {
  const { measure, columns } = inputs(0);
  const lower = measure.staves[1];
  const marks = columns.slice(0, 2).map(({ x }, index) => ({
    text: index ? '\ue535' : '\ue52a', x, y: lower.bottom - lower.space * 2,
    font: 'LelandText', size: lower.space * 4, code: index,
  }));
  const result = applyMuseScoreDirections(reference, [{
    geometry: { ...geometry, glyphs: marks }, measure, index: 0, notes: [], columns,
  }]);
  expect(result.dynamics).toEqual(columns.slice(0, 2).map(({ beat }, i) => ({
    beat, text: i ? 'fz' : 'ppp', below: true, letters: true,
  })));
});

test('closes a hairpin in the space after the last attack at the end of its bar', () => {
  const { measure, bar } = inputs(0);
  const [upper] = measure.staves;
  const { space } = upper;
  const left = measure.left + space * 2, right = measure.right - space * 2.9;
  const y = upper.bottom - space * 2;
  const segments = [-1, 1].map(side => ({ x1: left, y1: y, x2: right, y2: y + side * space * 0.6, width: 0.5 }));
  const read = (last: number) => applyMuseScoreDirections(reference, [{
    geometry: { glyphs: [], curvedFills: [], fills: [], segments }, measure, index: 0, notes: [],
    columns: [{ x: left, beat: bar.start }, { x: last, beat: bar.start + bar.length / 2 }],
  }]).hairpins;
  expect(read(right - space * 2)[0]?.end).toBe(bar.start + bar.length);
  expect(read(right)[0]?.end).toBe(bar.start + bar.length / 2);
});

test('joins a hairpin that extends slightly beyond a system barline to its printed continuation', () => {
  const systems = [0, 1].map(index => {
    const { measure, bar } = inputs(index);
    const { bottom, space } = measure.staves[0];
    const y = bottom - space * 2;
    const left = measure.left + space * 5;
    const right = measure.right + space * (index === 0 ? 0.85 : -0.25);
    const segments = [-1, 1].map(side => ({
      x1: left, y1: y + side * space * (index === 0 ? 0 : 0.25),
      x2: right, y2: y + side * space * 0.6, width: 0.5,
    }));
    return {
      geometry: { glyphs: [], curvedFills: [], fills: [], segments },
      measure, index, notes: [], columns: [{ x: left, beat: bar.start }],
    };
  });
  expect(applyMuseScoreDirections(reference, systems).hairpins).toEqual([
    { start: 0, end: reference.bars[1].start + reference.bars[1].length, type: 'crescendo', below: false, drawn: true },
  ]);
});

test('joins a hairpin that stops before the final barline and opens on the next system', () => {
  const systems = [0, 1].map(index => {
    const { measure, bar } = inputs(index);
    const { bottom, space } = measure.staves[0];
    const y = bottom - space * 2;
    const left = measure.left + space * 5;
    const right = measure.right - space * (index === 0 ? 2.9 : 0.25);
    const segments = [-1, 1].map(side => ({
      x1: left, y1: y + side * space * (index === 0 ? 0 : 0.25),
      x2: right, y2: y + side * space * 0.6, width: 0.5,
    }));
    return {
      geometry: { glyphs: [], curvedFills: [], fills: [], segments },
      measure, index, notes: [], columns: [
        { x: left, beat: bar.start },
        { x: right, beat: bar.start + bar.length - 0.5 },
      ],
    };
  });
  expect(applyMuseScoreDirections(reference, systems).hairpins).toEqual([
    { start: 0, end: reference.bars[1].start + reference.bars[1].length, type: 'crescendo', below: false, drawn: true },
  ]);
});

test('uses the barline for a hairpin that ends in the open space after a held note', () => {
  const { measure, bar } = inputs(0);
  const { bottom, space } = measure.staves[0];
  const y = bottom - space * 2;
  const left = measure.left + space * 5;
  const right = measure.right - space * 4;
  const segments = [-1, 1].map(side => ({ x1: left, y1: y + side * space * 0.6, x2: right, y2: y, width: 0.5 }));
  const read = (beats: number) => applyMuseScoreDirections(reference, [{
    geometry: { glyphs: [], curvedFills: [], fills: [], segments }, measure, index: 0,
    notes: [{ x: left, y: bottom, note: { ...reference.notes[0], beat: bar.start, beats } }],
    columns: [{ x: left, beat: bar.start }],
  }]).hairpins;
  expect(read(bar.length)).toEqual([
    { start: bar.start, end: bar.start + bar.length, type: 'diminuendo', below: false, drawn: true },
  ]);
  expect(read(bar.length / 2)).toEqual([]);
});

test('reads a tilted hairpin whose arms slope in the same direction', () => {
  const { measure, bar } = inputs(1);
  const { bottom, space } = measure.staves[0];
  const y = bottom - space * 2;
  const left = measure.left + space * 2;
  const right = measure.right - space * 1.5;
  const segments = [0.28, 1.12].map(drop => ({
    x1: left, y1: y, x2: right, y2: y - drop * space, width: 0.5,
  }));
  expect(applyMuseScoreDirections(reference, [{
    geometry: { glyphs: [], curvedFills: [], fills: [], segments }, measure, index: 1, notes: [],
    columns: [{ x: left, beat: bar.start }],
  }]).hairpins).toEqual([
    { start: bar.start, end: bar.start + bar.length, type: 'crescendo', below: false, drawn: true },
  ]);
});

test('anchors a hairpin displaced by a dynamic on the same line', () => {
  const { measure, bar } = inputs(1);
  const { bottom, space } = measure.staves[0];
  const y = bottom - space * 2;
  const first = measure.left + space * 2;
  const left = first + space * 3.75;
  const right = measure.right - space;
  const segments = [-1, 1].map(side => ({ x1: left, y1: y, x2: right, y2: y + side * space * 0.6, width: 0.5 }));
  const glyphs = [0xe521, 0xe522].map((code, index) => ({
    x: first + space * 1.8 * index, y: y - space * 0.5, size: space * 2.4,
    text: String.fromCodePoint(code), code, font: 'Leland',
  }));
  expect(applyMuseScoreDirections(reference, [{
    geometry: { glyphs, curvedFills: [], fills: [], segments }, measure, index: 1, notes: [],
    columns: [{ x: first, beat: bar.start }, { x: left, beat: bar.start + 1 }],
  }]).hairpins).toEqual([
    { start: bar.start, end: bar.start + bar.length, type: 'crescendo', below: false, drawn: true },
  ]);
});

test('keeps an inline dynamic in a direction and preserves a separate dynamic', () => {
  const { bar, measure, columns } = inputs(0);
  const [upper] = measure.staves;
  const { space } = upper;
  const x = columns[0].x;
  const y = upper.bottom - 2 * space;
  const size = 2 * space;
  const run = (text: string, offset: number, baseline: number, textObject: number) =>
    Array.from(text, (letter, i) => ({
      x: x + (offset + i) * space, y: baseline, text: letter, code: letter.codePointAt(0)!,
      size, font: 'Edwin-Italic', textObject,
    }));
  const printed = [
    ...run('2nd time', 0, y, 1),
    ...run('più ', 9, y + space * 0.03, 2),
    { x: x + 13 * space, y: y + space * 0.03, text: '\ue522', code: 0xe522, size, font: 'LelandText', textObject: 3 },
    { x, y: y - space, text: '\ue520', code: 0xe520, size, font: 'LelandText', textObject: 4 },
  ];
  const result = applyMuseScoreDirections(reference, [{
    geometry: { ...geometry, glyphs: printed },
    measure: { ...measure, right: Math.max(measure.right, x + 15 * space) }, index: 0, notes: [], columns,
  }]);
  expect(result.words).toEqual([{ beat: bar.start, text: '2nd time più f', below: true, tempo: false }]);
  expect(result.dynamics).toEqual([{ beat: bar.start, text: 'p', below: false, letters: true }]);
});
