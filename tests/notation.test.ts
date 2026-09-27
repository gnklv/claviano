import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { writtenDuration } from '../src/domain/notation/noteValue';
import { quantize } from '../src/domain/notation/quantize';
import { barAccidentals, keyAlteration, spell, type SpelledPitch } from '../src/domain/notation/spelling';

const DO = 0, MI = 2, FA = 3, SOL = 4, LA = 5, SI = 6;

describe('spell', () => {
  it('names white keys by their letter', () => {
    expect(spell(pitch('Do', 4), 0)).toEqual({ letter: DO, octave: 4, alteration: 0 });
    expect(spell(pitch('Si', 3), 0)).toEqual({ letter: SI, octave: 3, alteration: 0 });
  });

  it('writes black keys with sharps in sharp keys and in Do major', () => {
    expect(spell(pitch('Fa#', 4), 1)).toEqual({ letter: FA, octave: 4, alteration: 1 });
    expect(spell(pitch('Do#', 5), 0)).toEqual({ letter: DO, octave: 5, alteration: 1 });
  });

  it('writes black keys with flats in flat keys', () => {
    expect(spell(pitch('Sib', 3), -1)).toEqual({ letter: SI, octave: 3, alteration: -1 });
    expect(spell(pitch('Mib', 4), -3)).toEqual({ letter: MI, octave: 4, alteration: -1 });
  });
});

describe('keyAlteration', () => {
  it('knows which letters a key signature raises or lowers', () => {
    expect(keyAlteration(FA, 1)).toBe(1); // Sol major: Fa♯
    expect(keyAlteration(DO, 1)).toBe(0);
    expect(keyAlteration(SI, -1)).toBe(-1); // Fa major: Si♭
    expect(keyAlteration(LA, -4)).toBe(-1); // La♭ major: Si Mi La Re
    expect(keyAlteration(SOL, -4)).toBe(0);
  });
});

describe('barAccidentals', () => {
  const note = (letter: SpelledPitch['letter'], alteration: SpelledPitch['alteration'], octave = 4): SpelledPitch => ({
    letter,
    octave,
    alteration,
  });

  it('prints nothing for notes the key signature already covers', () => {
    expect(barAccidentals([note(FA, 1), note(SOL, 0)], 1)).toEqual([null, null]);
  });

  it('prints a natural when a note cancels the key signature', () => {
    expect(barAccidentals([note(FA, 0)], 1)).toEqual(['natural']);
  });

  it('keeps an accidental in force until the end of the bar', () => {
    expect(barAccidentals([note(FA, 1), note(FA, 1), note(FA, 0)], 0)).toEqual(['sharp', null, 'natural']);
  });

  it('treats the same letter in another octave separately', () => {
    expect(barAccidentals([note(DO, 1, 4), note(DO, 1, 5)], 0)).toEqual(['sharp', 'sharp']);
  });
});

describe('writtenDuration', () => {
  it('maps simple lengths to note values', () => {
    expect(writtenDuration(4)).toEqual({ value: 'whole', dots: 0 });
    expect(writtenDuration(2)).toEqual({ value: 'half', dots: 0 });
    expect(writtenDuration(1)).toEqual({ value: 'quarter', dots: 0 });
    expect(writtenDuration(0.5)).toEqual({ value: 'eighth', dots: 0 });
    expect(writtenDuration(0.25)).toEqual({ value: 'sixteenth', dots: 0 });
    expect(writtenDuration(0.125)).toEqual({ value: 'thirtySecond', dots: 0 });
  });

  it('uses dots for one and a half times a value', () => {
    expect(writtenDuration(1.5)).toEqual({ value: 'quarter', dots: 1 });
    expect(writtenDuration(3)).toEqual({ value: 'half', dots: 1 });
    expect(writtenDuration(0.75)).toEqual({ value: 'eighth', dots: 1 });
  });

  it('falls back to the longest note that fits for lengths needing ties', () => {
    expect(writtenDuration(1.25)).toEqual({ value: 'quarter', dots: 0 });
    expect(writtenDuration(0.05)).toEqual({ value: 'thirtySecond', dots: 0 });
  });
});

describe('quantize', () => {
  it('snaps a slightly short eighth to a clean one', () => {
    expect(quantize(1.02, 0.47)).toEqual({ beat: 1, beats: 0.5 });
  });

  it('never makes a note shorter than a thirty-second', () => {
    expect(quantize(2, 0.03)).toEqual({ beat: 2, beats: 0.125 });
  });

  it('keeps thirty-seconds', () => {
    expect(quantize(1.125, 0.12)).toEqual({ beat: 1.125, beats: 0.125 });
  });

  it('leaves exact values alone', () => {
    expect(quantize(0.5, 1.5)).toEqual({ beat: 0.5, beats: 1.5 });
  });
});
