// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPdf } from '../../../src/infrastructure/parsers/pdf/document';
import { extractPdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';
import { isHead, pianoStaffPairs, sortedX } from '../../../src/infrastructure/parsers/pdf/pianoGeometry';
import { readBarOctaves } from '../../../src/infrastructure/parsers/pdf/pianoOctaves';
import { midiOf } from '../../../src/domain/notation/spelling';
import { score } from '../../showcase/showcaseScore';

const geometry = extractPdfGeometry(readPdf(readFileSync('tests/fixtures/pdf/showcase.pdf')).page(0));
const measure = pianoStaffPairs(geometry.segments)[13];
const timed = [1, 2].flatMap(staff => {
  const heads = sortedX(geometry.glyphs.filter(g => isHead(g) && g.x > measure.left && g.x < measure.right
    && g.y > measure.staves[1].bottom - 5 * measure.staves[1].space
    && g.y < measure.staves[0].bottom + 8 * measure.staves[0].space
    && (g.y >= measure.staves[0].bottom) === (staff === 1)));
  return score.notation.notes.filter(n => n.bar === 13 && n.staff === staff)
    .map((n, i) => ({ ...heads[i], note: { ...n, sounding: midiOf(n.pitch) } }));
});

test('reads both octave hooks, ending after the half notes and sounding the low A0', () => {
  const bar = readBarOctaves(geometry, measure, timed);
  expect(bar?.octaveShifts).toEqual(score.notation.octaveShifts);
  expect(bar?.notes.map(n => n.note.sounding)).toEqual([86, 90, 93, 38, 21]);
});

test('rejects a detached hook instead of guessing the end of the octave line', () => {
  const segments = geometry.segments.filter(s => s.y1 > measure.staves[1].bottom - 4 * measure.staves[1].space);
  expect(readBarOctaves({ ...geometry, segments }, measure, timed)).toBeNull();
});

test('rejects a low octave bracket whose opening numeral is missing', () => {
  const glyphs = geometry.glyphs.filter(g => !(g.text === '\ue510' && g.y < measure.staves[1].bottom));
  expect(readBarOctaves({ ...geometry, glyphs }, measure, timed)).toBeNull();
});
