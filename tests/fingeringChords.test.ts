import { describe, expect, it } from 'vitest';
import { reachBetween } from '../src/domain/fingering/hand';
import { fingerHints, withFingerHints } from '../src/domain/fingering/hints';
import { transcribed } from '../src/domain/notation/transcription';
import { fingerPassage } from '../src/domain/fingering/passage';
import type { Hand, Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';

/*
 * Fingers for chords, and the hints for a piece as it is written: where a hand takes several keys at
 * once, and what of it is said on the page. (Lines and scales: fingering.test.ts.)
 */

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
