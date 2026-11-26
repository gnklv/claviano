import { expect, test } from 'vitest';
import { repeatDots } from '../../../src/infrastructure/parsers/pdf/lilyPondRepeats';
import type { PdfGeometry } from '../../../src/infrastructure/parsers/pdf/geometry';

test('keeps augmentation dots near an ordinary barline and reads the pair beside a heavy repeat stroke', () => {
  const measure = { left: 0, right: 20, staves: [{ space: 1, bottom: 0 }], systemStart: false };
  const chord = [1.5, 2.5].map(y => ({ x: 17, y, text: '\ue0a4', code: 0x3b, font: 'Emmentaler-20', size: 4 }));
  const pair = chord.map(head => ({ ...head, x: 19, text: '\ue1e7' }));
  const bar = { x1: 20, x2: 20, y1: 0, y2: 4, width: .1 };
  const geometry: PdfGeometry = { segments: [bar], glyphs: [...chord, ...pair], fills: [], curvedFills: [] };
  expect(repeatDots(geometry, [geometry.glyphs], measure).dots.size).toBe(0);
  bar.width = .6;
  expect(repeatDots(geometry, [pair], measure).navigation).toEqual({ repeatEnd: { times: 2 } });
});
