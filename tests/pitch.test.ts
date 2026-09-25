import { describe, expect, it } from 'vitest';
import { pitch, pitchName } from '../src/domain/pitch';

describe('pitch', () => {
  it('converts solfège names to MIDI numbers', () => {
    expect(pitch('Do', 4)).toBe(60);
    expect(pitch('La', 4)).toBe(69);
    expect(pitch('Sol', 2)).toBe(43);
    expect(pitch('La', 0)).toBe(21);
    expect(pitch('Do', 8)).toBe(108);
  });

  it('applies sharps and flats', () => {
    expect(pitch('Fa#', 3)).toBe(54);
    expect(pitch('Sib', 2)).toBe(46);
    expect(pitch('Dob', 4)).toBe(59); // same key as Si3
  });

  it('names MIDI numbers in solfège with sharps', () => {
    expect(pitchName(60)).toBe('Do4');
    expect(pitchName(61)).toBe('Do#4');
    expect(pitchName(67)).toBe('Sol4');
    expect(pitchName(21)).toBe('La0');
  });
});
