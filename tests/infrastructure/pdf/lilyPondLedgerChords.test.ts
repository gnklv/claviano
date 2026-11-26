import { expect, test } from 'vitest';
import type { PdfGlyph } from '../../../src/infrastructure/parsers/pdf/geometry';
import { ledgerChordStaff } from '../../../src/infrastructure/parsers/pdf/lilyPondLedgerChords';

const chord = [-2.9, -4.9, -5.9].map((y): PdfGlyph => ({
  font: 'Emmentaler-20', size: 4, x: 3, y, text: '\ue0a4', code: 0xe0a4,
}));
const stem = { x1: 3.055, x2: 3.055, y1: -9, y2: -3.06, width: .07 };
const lower = { bottom: -10.9, space: 1 };

test('a common stem and staff grid identify the high notes of a bass chord across the midpoint', () => {
  const other = { ...chord[0], y: 2 };
  const measure = { left: 0, right: 12, systemStart: false, staves: [{ bottom: 0, space: 1 }, lower] };
  const owners = ledgerChordStaff([...chord, other], [stem], measure);
  expect([...owners.keys()]).toEqual(chord);
  expect([...owners.values()]).toEqual([lower, lower, lower]);
  expect(ledgerChordStaff(chord, [], measure).size).toBe(0);
  expect(ledgerChordStaff(chord, [stem], { ...measure, staves: [{ bottom: .1, space: 1 }, lower] }).size).toBe(0);
});

test('a shared stem can identify the top chord of the following system', () => {
  const previousBass = { bottom: 0, space: 1 };
  const followingTreble = { bottom: -10.9, space: 1 };
  const previous = { left: 0, right: 12, systemStart: false, staves: [{ bottom: 12, space: 1 }, previousBass] };
  const following = { ...previous, staves: [followingTreble, { bottom: -20.9, space: 1 }] };
  const nearby = [...previous.staves, ...following.staves];
  for (const measure of [previous, following]) {
    const owners = ledgerChordStaff(chord, [stem], measure, nearby);
    expect([...owners.values()]).toEqual([followingTreble, followingTreble, followingTreble]);
  }
});
