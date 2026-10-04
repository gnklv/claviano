import { describe, expect, it } from 'vitest';
import { nearestRecorded, onsetSeconds, playbackRate, velocityGain } from '../src/infrastructure/audio/pianoSamples';

/** Every third key, as recorded: A0, C1, D#1, F#1, A1 … */
const recorded = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);

describe('nearestRecorded', () => {
  it('plays a recorded note from its own sample', () => {
    expect(nearestRecorded(recorded, 60)).toBe(60);
  });

  it('plays the notes between from the neighbour a semitone away', () => {
    expect(nearestRecorded(recorded, 61)).toBe(60);
    expect(nearestRecorded(recorded, 62)).toBe(63);
  });

  it('keeps to the ends of the keyboard', () => {
    expect(nearestRecorded(recorded, 12)).toBe(21);
    expect(nearestRecorded(recorded, 120)).toBe(108);
  });
});

describe('playbackRate', () => {
  it('is 1 for the recorded note, and a semitone faster or slower for its neighbours', () => {
    expect(playbackRate(60, 60)).toBe(1);
    expect(playbackRate(60, 61)).toBeCloseTo(1.0595);
    expect(playbackRate(63, 62)).toBeCloseTo(0.9439);
    expect(playbackRate(60, 72)).toBe(2);
  });
});

describe('onsetSeconds', () => {
  it('skips the silence before the note, keeping a little lead', () => {
    const left = new Float32Array(1000);
    const right = new Float32Array(1000);
    left.fill(0.001, 0, 500); // noise below the threshold
    right[400] = 0.2; // the strike, first heard in the right channel
    left[420] = 0.3;
    expect(onsetSeconds([left, right], 10000)).toBeCloseTo(0.04 - 0.002);
  });

  it('is the start for a sample that begins at once, or one that is all silence', () => {
    expect(onsetSeconds([new Float32Array([0.5, 0.5])], 44100)).toBe(0);
    expect(onsetSeconds([new Float32Array(100)], 44100)).toBe(0);
  });
});

describe('velocityGain', () => {
  it('leaves the recorded loudness as it is', () => {
    expect(velocityGain(0.5, 0.5)).toBe(1);
  });

  it('makes harder strikes louder and softer ones quieter, more than in proportion', () => {
    expect(velocityGain(1, 0.5)).toBeGreaterThan(2);
    expect(velocityGain(0.25, 0.5)).toBeLessThan(0.5);
  });

  it('never goes silent', () => {
    expect(velocityGain(0, 0.5)).toBeGreaterThan(0);
  });
});
