import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';

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
});
