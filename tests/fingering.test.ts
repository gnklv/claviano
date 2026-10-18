import { describe, expect, it } from 'vitest';
import { reachBetween, type Finger } from '../src/domain/fingering/hand';
import { fingerHints, withFingerHints } from '../src/domain/fingering/hints';
import { transcribed } from '../src/domain/notation/transcription';
import { fingerPassage } from '../src/domain/fingering/passage';
import { scaleFingers, type Key } from '../src/domain/fingering/scales';
import type { Hand, Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';

/* Fingers for a line of single notes. Scales are the check everyone knows: the textbook has them. */

const MAJOR = [2, 2, 1, 2, 2, 2, 1];
const scale = (root: number, octaves = 1): number[] => {
  const up = [root];
  for (let octave = 0; octave < octaves; octave++) for (const step of MAJOR) up.push(up.at(-1)! + step);
  return up;
};
const down = (pitches: number[]): number[] => [...pitches].reverse();
/** The fingers for a line of single notes, one for each: a passage of one note at a time. */
const fingerLine = (pitches: readonly number[], hand: Hand, hints: { given?: (Finger | null)[]; key?: Key } = {}): Finger[] =>
  fingerPassage(
    pitches.map((pitch) => [pitch]),
    hand,
    { given: hints.given?.map((finger) => [finger]), key: hints.key },
  ).map((moment) => moment[0]);
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

describe('fingers for chords', () => {
  const taken = (moments: number[][], hand: Hand = 'right') => fingerPassage(moments, hand).map((fingers) => fingers.join('')).join(' ');

  it('takes a triad as it lies under the hand: 1-3-5 in root position, 1-2-5 where the gap is on top', () => {
    expect(taken([[60, 64, 67]])).toBe('135');
    expect(taken([[64, 67, 72]])).toBe('125');
    expect(taken([[67, 72, 76]])).toBe('135');
  });

  it('gives the left hand the same shapes from the other side', () => {
    expect(taken([[48, 52, 55]], 'left')).toBe('531');
    expect(taken([[36, 48]], 'left')).toBe('51');
  });

  it('takes an octave and a sixth with the thumb and the little finger, four keys with 1-2-3-5, five with all five', () => {
    expect(taken([[60, 72]])).toBe('15');
    expect(taken([[62, 71]])).toBe('15');
    expect(taken([[60, 64, 67, 72]])).toBe('1235');
    expect(taken([[60, 62, 64, 65, 67]])).toBe('12345');
  });

  it('has its fingers in the order of the keys, and no two further apart than a hand reaches', () => {
    for (const keys of [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 63, 67, 70], [55, 67]]) {
      const [fingers] = fingerPassage([keys], 'right');
      expect(fingers).toHaveLength(keys.length);
      for (let i = 1; i < keys.length; i++) {
        expect(fingers[i]).toBeGreaterThan(fingers[i - 1]);
        const reach = reachBetween(fingers[i - 1], fingers[i]);
        expect(keys[i] - keys[i - 1]).toBeLessThanOrEqual(reach.maxPractical);
      }
    }
  });

  it('keeps the hand where it is from chord to chord where it can, and a held key under its finger', () => {
    // Do major, then Fa major over the same Do: both lie under five fingers set from Do (Do Mi Fa Sol La),
    // so the first is taken 1-2-4 and the second 1-3-5, and the hand does not move.
    expect(taken([[60, 64, 67], [60, 65, 69]])).toBe('124 135');
    const fingers = fingerPassage([[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]], 'right');
    expect(fingers[0][0]).toBe(1);
    expect(fingers[1][0]).toBe(1);
  });

  it('takes a bass note with the little finger, and the chord over it as it lies', () => {
    // Far below its chord, as a waltz has them: the hand moves, and the little finger is the nearest.
    expect(taken([[36], [48, 52, 55], [48, 52, 55], [43], [47, 50, 55], [47, 50, 55]], 'left')).toBe('5 531 531 5 531 531');
    // Close under it: bass and chord are one chord broken in two, under one position of the hand.
    expect(taken([[53], [57, 60]], 'left')).toBe('5 31');
    expect(taken([[50], [53, 57, 62]], 'left')).toBe('5 421');
  });

  it('fingers the same figure the same way each time it comes', () => {
    const figure = [[52, 64], [59], [55, 64], [59]];
    const fingers = fingerPassage([...figure, ...figure, ...figure], 'left').map((moment) => moment.join(''));
    expect(fingers.slice(4, 8)).toEqual(fingers.slice(0, 4));
    expect(fingers.slice(8)).toEqual(fingers.slice(0, 4));
  });

  it('leads a line into a chord and out of it', () => {
    const fingers = fingerPassage([[64], [65], [67], [60, 64, 67], [72]], 'right');
    expect(fingers.map((moment) => moment.length)).toEqual([1, 1, 1, 3, 1]);
    expect(fingers[3][0]).toBe(1);
    expect(fingers[4]).toEqual([5]);
  });

  it('takes fingers that are given in a chord, and fits the others to them', () => {
    const [fingers] = fingerPassage([[60, 64, 67]], 'right', { given: [[null, 2, null]] });
    expect(fingers).toEqual([1, 2, 4]);
  });

  it('gives no fingers to what one hand cannot take: more keys than fingers, keys too far apart', () => {
    expect(fingerPassage([[60, 62, 64, 65, 67, 69]], 'right')).toEqual([[]]);
    expect(fingerPassage([[36, 84]], 'right')).toEqual([[]]);
    // …and goes on with what comes after.
    expect(fingerPassage([[36, 84], [60, 64, 67]], 'right')[1]).toEqual([1, 3, 5]);
  });

  it('comes to what follows a rest freely: nothing is counted for the leap', () => {
    const fingers = fingerPassage([[60], [62], [64], [84], [86], [88]], 'right', { free: [false, false, false, true, false, false] });
    expect(fingers.flat().join(' ')).toBe('1 2 3 1 2 3');
  });
});

describe('fingering hints for a piece as it is written', () => {
  const note = (pitch: number, beat: number, beats: number, hand: Hand): Note => ({ pitch, start: beat, duration: beats, beat, beats, velocity: 0.7, hand });
  /** A piece from its played notes, written down. */
  const piece = (notes: Note[], bars = [0]) => transcribed(createScore('A piece', notes, bars));
  /** The hints by the pitch of the note, in the order the notes are written. */
  const hinted = (score: ReturnType<typeof piece>) => fingerHints(score).map((hint, i) => [score.notation.notes[i].sounding, hint?.finger ?? null, hint?.said ?? false]);

  it('has a finger for each written note, and says the first of a line: the rest follow from it', () => {
    const score = piece([60, 62, 64, 65, 67].map((pitch, i) => note(pitch, i, 1, 'right')), [0, 4]);
    expect(hinted(score)).toEqual([
      [60, 1, true],
      [62, 2, false],
      [64, 3, false],
      [65, 4, false],
      [67, 5, false],
    ]);
  });

  it('says where the hand moves: the thumb passed under', () => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(pitch, i * 0.5, 0.5, 'right'));
    const said = hinted(piece(scale)).filter(([, , said]) => said).map(([pitch, finger]) => [pitch, finger]);
    // The start, and the thumb on Fa.
    expect(said).toEqual([
      [60, 1],
      [65, 1],
    ]);
  });

  it('says a chord, and a bass note the hand has moved to; and the same thing only once', () => {
    const waltz = [0, 4].flatMap((bar) => [note(36, bar, 1, 'left'), note(48, bar + 1, 1, 'left'), note(52, bar + 1, 1, 'left'), note(55, bar + 1, 1, 'left'), note(48, bar + 2, 1, 'left'), note(52, bar + 2, 1, 'left'), note(55, bar + 2, 1, 'left')]);
    const said = hinted(piece(waltz, [0, 4])).map(([, , said]) => said);
    // The bass and the first chord are said; the chord again, the bass again, are not.
    expect(said.slice(0, 4)).toEqual([true, true, true, true]);
    expect(said.slice(4, 7)).toEqual([false, false, false]);
    expect(said.slice(8)).toEqual([false, false, false, false, false, false]);
  });

  it('says the first note after a rest', () => {
    const played = piece([note(60, 0, 1, 'right'), note(62, 1, 1, 'right'), note(72, 4, 1, 'right'), note(74, 5, 1, 'right')], [0, 4]);
    // (Written down from playing, a note lasts to the next one: here the second is cut to its own length, a rest after it.)
    const notes = played.notation.notes.map((written) => (written.sounding === 62 ? { ...written, beats: 1 } : written));
    const score = { ...played, notation: { ...played.notation, notes } };
    expect(hinted(score).map(([, , said]) => said)).toEqual([true, false, true, false]);
  });

  it('leaves a finger the notes give as it is, and fits the others to it', () => {
    const score = piece([60, 62, 64].map((pitch, i) => note(pitch, i, 1, 'right')));
    const written = score.notation.notes.map((written, i) => (i === 0 ? { ...written, fingering: { text: '2', below: null } } : written));
    const hints = fingerHints({ ...score, notation: { ...score.notation, notes: written } });
    expect(hints[0]).toBeNull();
    expect(hints.slice(1).map((hint) => hint?.finger)).toEqual([3, 4]);
  });

  it('writes the hints worth saying into the piece, marked as hints, and leaves the rest of it alone', () => {
    const score = piece([60, 62, 64, 65, 67].map((pitch, i) => note(pitch, i, 1, 'right')), [0, 4]);
    const hinted = withFingerHints(score);
    expect(hinted.notation.notes.map((written) => written.fingering ?? null)).toEqual([{ text: '1', below: null, hint: true }, null, null, null, null]);
    expect(hinted.notes).toBe(score.notes);
    expect(score.notation.notes.every((written) => !written.fingering)).toBe(true);
  });
});
