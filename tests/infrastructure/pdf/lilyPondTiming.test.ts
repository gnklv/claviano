import { expect, test } from 'vitest';
import type { BeamMark } from '../../../src/domain/notation/written';
import { timeLilyPondStaves } from '../../../src/infrastructure/parsers/pdf/lilyPondTiming';
import type { PianoAttack } from '../../../src/infrastructure/parsers/pdf/pianoAttacks';

function attack(x: number, beats: number, up = true, beams: BeamMark[] = []): PianoAttack {
  return { x, beats, beams, heads: [], duration: { value: 'quarter', dots: 0 }, stem: { x, up, far: 4 } };
}

test('takes onset landmarks from the other staff when a concurrent voice omits rests', () => {
  const upper = [attack(0, 0.5), attack(0, 1, false), attack(4, 0.5), attack(8, 0.5)];
  const lower = [0, 4, 8, 12].map(x => attack(x, 0.5));
  const result = timeLilyPondStaves([upper, lower], 1, 2, false);
  expect(result?.[0]?.timed.map(a => [a.beat, a.voice])).toEqual([[0, 0], [0, 1], [0.5, 0], [1, 0]]);
  expect(result?.[1]?.timed.map(a => a.beat)).toEqual([0, 0.5, 1, 1.5]);
});

test('joins the down-stem head displaced by a head width to its simultaneous attack', () => {
  const upper = [attack(0, 2), attack(0, 1, false), attack(8, 1), attack(9.32, 0.5, false)];
  const lower = [attack(0, 1), attack(4, 1), attack(8, 0.5), attack(12, 0.5)];
  const result = timeLilyPondStaves([upper, lower], 1, 3, false);
  expect(result?.[0]?.timed.map(a => a.beat)).toEqual([0, 0, 2, 2]);
});

test('uses beam continuation to recover the onset of a displaced head', () => {
  const upper = [0, 2, 4, 6].map(x => attack(x, 0.25));
  const lower = [
    attack(0, 1), attack(2.17, 0.5, false, ['begin']),
    attack(4, 0.25, false, ['continue']), attack(6, 0.25, false, ['end']),
  ];
  const result = timeLilyPondStaves([upper, lower], 1, 1, false);
  expect(result?.[1]?.timed.map(a => a.beat)).toEqual([0, 0, 0.5, 0.75]);
});
