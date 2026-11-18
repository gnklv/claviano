// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { performanceOrder } from '../../../src/domain/notation/navigation';
import { readBarNavigation } from '../../../src/infrastructure/parsers/pdf/pianoNavigation';
import { dynamicsAlongPage } from '../../../src/domain/notation/dynamics';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
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
