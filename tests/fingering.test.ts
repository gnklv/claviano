import { describe, expect, it } from 'vitest';
import { reachBetween, type Finger } from '../src/domain/fingering/hand';
import { fingerLine } from '../src/domain/fingering/melody';
import { scaleFingers } from '../src/domain/fingering/scales';

/* Fingers for a line of single notes. Scales are the check everyone knows: the textbook has them. */

const MAJOR = [2, 2, 1, 2, 2, 2, 1];
const scale = (root: number, octaves = 1): number[] => {
  const up = [root];
  for (let octave = 0; octave < octaves; octave++) for (const step of MAJOR) up.push(up.at(-1)! + step);
  return up;
};
const down = (pitches: number[]): number[] => [...pitches].reverse();
const right = (pitches: number[]) => fingerLine(pitches, 'right').join(' ');
const left = (pitches: number[]) => fingerLine(pitches, 'left').join(' ');
/** A line turned over about Re: white keys stay white, black stay black, up becomes down. */
const mirrored = (pitches: number[]): number[] => pitches.map((pitch) => 124 - pitch);

describe('what a hand reaches', () => {
  it('is, from the thumb to the little finger, an octave and more at a stretch; between neighbours, a third', () => {
    expect(reachBetween(1, 5)).toMatchObject({ maxRelaxed: 10, maxComfortable: 13, maxPractical: 15 });
    expect(reachBetween(3, 4)).toMatchObject({ minPractical: 1, maxPractical: 4 });
  });

  it('is the same the other way round, counted backwards', () => {
    expect(reachBetween(5, 1)).toMatchObject({ minPractical: -15, minComfortable: -13, maxPractical: 1 });
    expect(reachBetween(2, 2)).toMatchObject({ minPractical: 0, maxPractical: 0 });
  });
});

describe('scales, as every school teaches them', () => {
  const HARMONIC_MINOR = [2, 1, 2, 2, 1, 3, 1];
  const run = (root: number, steps: number[], octaves: number): number[] => {
    const up = [root];
    for (let octave = 0; octave < octaves; octave++) for (const step of steps) up.push(up.at(-1)! + step);
    return up;
  };
  /** Two octaves up from each tonic (0 is Do): the right hand's fingers, then the left's. */
  const MAJORS: [string, number, string, string][] = [
    ['Do', 0, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Sol', 7, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Re', 2, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['La', 9, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Mi', 4, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Si', 11, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '4 3 2 1 4 3 2 1 3 2 1 4 3 2 1'],
    ['Fa', 5, '1 2 3 4 1 2 3 1 2 3 4 1 2 3 4', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Si♭', 10, '2 1 2 3 1 2 3 4 1 2 3 1 2 3 4', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['Mi♭', 3, '2 1 2 3 4 1 2 3 1 2 3 4 1 2 3', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['La♭', 8, '2 3 1 2 3 1 2 3 4 1 2 3 1 2 3', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['Re♭', 1, '2 3 1 2 3 4 1 2 3 1 2 3 4 1 2', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['Fa♯', 6, '2 3 4 1 2 3 1 2 3 4 1 2 3 1 2', '4 3 2 1 3 2 1 4 3 2 1 3 2 1 2'],
  ];

  it.each(MAJORS)('%s major, two octaves up and down, both hands', (_, tonic, rightHand, leftHand) => {
    const up = run(48 + tonic, MAJOR, 2);
    expect(right(up)).toBe(rightHand);
    expect(left(up)).toBe(leftHand);
    // Down is up read backwards: the same finger on the same key.
    expect(right(down(up))).toBe(rightHand.split(' ').reverse().join(' '));
    expect(left(down(up))).toBe(leftHand.split(' ').reverse().join(' '));
  });

  const MINORS: [string, number, string, string][] = [
    ['La', 9, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Mi', 4, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Re', 2, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Sol', 7, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Do', 0, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Si', 11, '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', '4 3 2 1 4 3 2 1 3 2 1 4 3 2 1'],
    ['Fa', 5, '1 2 3 4 1 2 3 1 2 3 4 1 2 3 4', '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1'],
    ['Fa♯', 6, '2 3 1 2 3 1 2 3 4 1 2 3 1 2 3', '4 3 2 1 3 2 1 4 3 2 1 3 2 1 2'],
    ['Do♯', 1, '2 3 1 2 3 1 2 3 4 1 2 3 1 2 3', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['Sol♯', 8, '2 3 1 2 3 1 2 3 4 1 2 3 1 2 3', '3 2 1 4 3 2 1 3 2 1 4 3 2 1 2'],
    ['Mi♭', 3, '2 1 2 3 4 1 2 3 1 2 3 4 1 2 3', '2 1 4 3 2 1 3 2 1 4 3 2 1 3 2'],
    ['Si♭', 10, '2 1 2 3 1 2 3 4 1 2 3 1 2 3 4', '2 1 3 2 1 4 3 2 1 3 2 1 4 3 2'],
  ];

  it.each(MINORS)('%s minor (harmonic), two octaves up, both hands', (_, tonic, rightHand, leftHand) => {
    const up = run(48 + tonic, HARMONIC_MINOR, 2);
    expect(right(up)).toBe(rightHand);
    expect(left(up)).toBe(leftHand);
  });

  it('tells a scale by the key of the piece, where the notes alone do not say: Do major and La minor share them', () => {
    // Re to Re on the white keys: of neither tonic.
    const whiteKeys = [62, 64, 65, 67, 69, 71, 72, 74];
    const inDo = fingerLine(whiteKeys, 'right', { key: { tonic: 0, minor: false } }).join(' ');
    const inLa = fingerLine(whiteKeys, 'right', { key: { tonic: 9, minor: true } }).join(' ');
    // In Do the thumb is on Fa and Do; in La, on Re and La.
    expect(inDo).toBe('2 3 1 2 3 4 1 2');
    expect(inLa).toBe('1 2 3 4 1 2 3 4');
  });

  it('fingers a run that turns back, the turning note once for both ways', () => {
    const upAndDown = [...scale(60), ...down(scale(60)).slice(1)];
    expect(right(upAndDown)).toBe('1 2 3 1 2 3 4 5 4 3 2 1 3 2 1');
  });

  it('leaves alone what is no scale: a chromatic run, a short run, a broken chord', () => {
    const chromatic = Array.from({ length: 13 }, (_, i) => 60 + i);
    expect(scaleFingers(chromatic, 'right').every((finger) => finger === null)).toBe(true);
    expect(scaleFingers([60, 62, 64, 65, 67], 'right').every((finger) => finger === null)).toBe(true);
    expect(scaleFingers([60, 64, 67, 72, 76, 79, 84], 'right').every((finger) => finger === null)).toBe(true);
  });

  it('fingers a scale inside a line, and fits what is around it to it', () => {
    // A leap up to Do, then the scale of Do major down an octave, then a step back up.
    const line = [67, 72, 71, 69, 67, 65, 64, 62, 60, 62];
    const fingers = fingerLine(line, 'right');
    expect(fingers.slice(1, 9).join(' ')).toBe('5 4 3 2 1 3 2 1');
    expect(fingers[0]).not.toBe(5);
    expect(fingers[9]).toBe(2);
  });
});

describe('fingers that are given', () => {
  it('stand as they are, and the rest is fitted around them', () => {
    // Five notes up, begun on the second finger: the thumb has to pass.
    const fingers = fingerLine([60, 62, 64, 65, 67], 'right', { given: [2, null, null, null, null] });
    expect(fingers[0]).toBe(2);
    expect(fingers).toHaveLength(5);
    expect(fingers.slice(1)).toContain(1);
  });

  it('are kept even where the rules would never have them: two keys in a row under one finger', () => {
    expect(fingerLine([60, 62, 64], 'right', { given: [3, 3, null] }).slice(0, 2)).toEqual([3, 3]);
  });

  it('come before the table of scales', () => {
    const fingers = fingerLine(scale(60), 'right', { given: [null, null, null, null, null, null, null, 4] });
    expect(fingers.at(-1)).toBe(4);
  });
});

describe('fingers for a line', () => {
  it('lays five notes in a row under five fingers, up and back', () => {
    expect(right([60, 62, 64, 65, 67, 65, 64, 62, 60])).toBe('1 2 3 4 5 4 3 2 1');
    expect(left([48, 50, 52, 53, 55])).toBe('5 4 3 2 1');
  });

  it('plays the scale of Do major as the textbook has it, right hand: the thumb under after the third, then after the fourth', () => {
    expect(right(scale(60))).toBe('1 2 3 1 2 3 4 5');
    expect(right(down(scale(60)))).toBe('5 4 3 2 1 3 2 1');
    expect(right(scale(60, 2))).toBe('1 2 3 1 2 3 4 1 2 3 1 2 3 4 5');
    expect(right(down(scale(60, 2)))).toBe('5 4 3 2 1 3 2 1 4 3 2 1 3 2 1');
  });

  it('plays Re and Mi major the same way, the black keys under the long fingers', () => {
    expect(right(scale(62, 2))).toBe('1 2 3 1 2 3 4 1 2 3 1 2 3 4 5');
    expect(right(scale(64, 2))).toBe('1 2 3 1 2 3 4 1 2 3 1 2 3 4 5');
  });

  it('keeps the thumb off the black key: Fa major goes four fingers before the thumb, Si♭ major starts on the second', () => {
    expect(right(scale(65))).toBe('1 2 3 4 1 2 3 4');
    expect(right(scale(58))).toBe('2 1 2 3 1 2 3 4');
  });

  it('plays a left-hand arpeggio over two octaves with a finger over the thumb', () => {
    expect(left([36, 40, 43, 48, 52, 55, 60])).toBe('5 3 2 1 3 2 1');
  });

  it('keeps a finger on a key struck again', () => {
    const fingers = fingerLine([64, 64, 64, 65], 'right');
    expect(new Set(fingers.slice(0, 3)).size).toBe(1);
  });

  it('never has one finger on two different keys in a row, and never a reach no hand has', () => {
    const lines = [scale(60, 2), down(scale(55, 2)), [60, 67, 64, 72, 62, 74, 67, 79], [72, 71, 69, 67, 65, 64, 62, 60, 59, 57], [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]];
    for (const pitches of lines) {
      for (const hand of ['right', 'left'] as const) {
        const fingers = fingerLine(pitches, hand);
        expect(fingers).toHaveLength(pitches.length);
        for (let i = 1; i < pitches.length; i++) {
          const [from, to] = [fingers[i - 1], fingers[i]];
          if (pitches[i] !== pitches[i - 1]) expect(from).not.toBe(to);
          const distance = hand === 'right' ? pitches[i] - pitches[i - 1] : pitches[i - 1] - pitches[i];
          const reach = reachBetween(from, to);
          expect(distance).toBeGreaterThanOrEqual(reach.minPractical);
          expect(distance).toBeLessThanOrEqual(reach.maxPractical);
        }
      }
    }
  });

  it('gives the left hand the mirror of what it gives the right, where no scale is known by heart', () => {
    for (const pitches of [[60, 64, 67, 72, 76], [64, 64, 65, 67, 67, 65, 64, 62], [60, 67, 64, 72, 62, 74], [60, 61, 62, 63, 64, 65, 66]]) {
      expect(left(mirrored(pitches))).toBe(right(pitches));
    }
  });

  it('fingers what is there: nothing, one note, and a leap no hand can make (the hand moves, and goes on)', () => {
    expect(fingerLine([], 'right')).toEqual([]);
    expect(fingerLine([60], 'right')).toHaveLength(1);
    const leap = fingerLine([36, 96, 98], 'right');
    expect(leap).toHaveLength(3);
    expect(leap.every((finger: Finger) => finger >= 1 && finger <= 5)).toBe(true);
  });
});
