// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import type { PdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { applyLilyPondTies } from '../../../src/infrastructure/parsers/pdf/lilyPondTies';
import { attributes, note, parser, score } from '../../support/musicXmlScore';

function arc(from: number, to: number, y: number, height = 0.8) {
  const a = { x: from, y }, b = { x: to, y };
  const c = { x: from + (to - from) / 3, y: y + height };
  const d = { x: to - (to - from) / 3, y: y + height };
  return [{ from: a, control1: c, control2: d, to: b },
    { from: b, control1: { ...d, y: d.y + 0.08 }, control2: { ...c, y: c.y + 0.08 }, to: a }];
}

function page(...curvedFills: PdfGeometry['curvedFills']): PdfGeometry {
  return { curvedFills, fills: [], segments: [], glyphs: [] };
}

function measure(left: number, right: number, bottom: number, systemStart = true) {
  return { left, right, systemStart, staves: [{ bottom, space: 1 }, { bottom: bottom - 12, space: 1 }] };
}

test('uses the tie direction to disambiguate aligned unisons with opposing voice stems', () => {
  const parsed = parser.parse(score(`<measure number="1">${attributes(1)}${note('D', 5, 2)}${note('D', 5, 2)}</measure>`), 'Unison');
  const notes = parsed.notation.notes.flatMap((note, i) => {
    const position = { x: 4 + i * 7, y: 0 };
    return [{ ...position, note: { ...note, voice: '1', stem: 'up' as const } },
      { ...position, note: { ...note, voice: '2', stem: 'down' as const } }];
  });
  const geometry = page(arc(5.55, 10.8, 0.5), arc(4.65, 11.65, 0.85, 1.8));
  const result = applyLilyPondTies([{ geometry, measure: measure(0, 20, 0), notes }]);
  expect(result.map(n => [n.tieStart, n.tieStop])).toEqual([
    [true, false], [false, false], [false, true], [false, false],
  ]);
  const onlySlur = page(arc(4.65, 11.65, 0.85, 0.9));
  expect(applyLilyPondTies([{ geometry: onlySlur, measure: measure(0, 20, 0), notes }])
    .every(n => !n.tieStart && !n.tieStop)).toBe(true);
});

test('connects tie fragments across pages and carries a silent accidental across the barline', () => {
  const parsed = parser.parse(score(`<measure number="1">${attributes(1)}${note('D', 5, 4)}</measure>
    <measure number="2">${note('D', 5, 4)}</measure>`), 'Tie');
  const [first, second] = parsed.notation.notes;
  const source = { ...first, pitch: { ...first.pitch, alteration: 1 as const }, sounding: first.sounding + 1 };
  const destination = page(arc(3, 6.8, 0.5));
  const bars = [
    { geometry: page(arc(11.55, 19.7, 0.5)), measure: measure(0, 20, 0), notes: [{ x: 10, y: 0, note: source }] },
    { geometry: destination, measure: measure(0, 20, 0), notes: [{ x: 7, y: 0, note: second }] },
  ];
  const read = () => applyLilyPondTies(bars);
  expect(read().map(n => [n.tieStart, n.tieStop, n.pitch.alteration])).toEqual([[true, false, 1], [false, true, 1]]);
  const point = { x: 11.55, y: 0.5 };
  const upper = { ...point, y: 0.56 };
  const lower = { ...point, y: 0.44 };
  bars[0].geometry.curvedFills[0] = [
    { from: point, to: point, control1: upper, control2: upper },
    { from: point, to: point, control1: lower, control2: lower },
  ];
  bars[0].measure.right = 12;
  expect(read().map(n => [n.tieStart, n.tieStop])).toEqual([[true, false], [false, true]]);
  destination.curvedFills.pop();
  expect(read().map(n => [n.tieStart, n.tieStop, n.pitch.alteration])).toEqual([[false, false, 1], [false, false, 0]]);
});

test('matches a shaped cross-bar whole-note tie with a control point before its opening tip', () => {
  const parsed = parser.parse(score(`<measure number="1">${attributes(1)}${note('D', 5, 4)}</measure>
    <measure number="2">${note('D', 5, 4)}</measure>`), 'Shaped tie');
  const [first, second] = parsed.notation.notes;
  const [forward, reverse] = arc(4.4, 26.5, 1.6, 2.5);
  const geometry = page([
    { ...forward, control1: { ...forward.control1, x: 4 } },
    { ...reverse, control2: { ...reverse.control2, x: 4 } },
  ]);
  const bars = [
    { geometry, measure: measure(0, 20, 0), notes: [{ x: 4, y: 0, note: first }] },
    { geometry, measure: measure(20, 40, 0, false), notes: [{ x: 26, y: 0, note: second }] },
  ];
  expect(applyLilyPondTies(bars).map(n => [n.tieStart, n.tieStop])).toEqual([[true, false], [false, true]]);
});
