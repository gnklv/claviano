import { describe, expect, it } from 'vitest';
import { Volume } from '../src/application/use-cases/Volume';
import { volumeGain } from '../src/infrastructure/audio/volume';
import { FakeAudio } from './fakes';

/* How loud the notes and the metronome are. */

describe('Volume', () => {
  it('starts with both as loud as they are made, and tells the sound nothing until one changes', () => {
    const audio = new FakeAudio();
    const volume = new Volume(audio);
    expect([volume.of('instrument'), volume.of('metronome')]).toEqual([1, 1]);
    expect(audio.volumes).toEqual({});
  });

  it('sets each on its own, and tells the sound', () => {
    const audio = new FakeAudio();
    const volume = new Volume(audio);
    volume.set('metronome', 0.4);
    expect([volume.of('instrument'), volume.of('metronome')]).toEqual([1, 0.4]);
    expect(audio.volumes).toEqual({ metronome: 0.4 });
    volume.set('instrument', 0.7);
    expect(audio.volumes).toEqual({ metronome: 0.4, instrument: 0.7 });
  });

  it('keeps within silent and full, whatever it is given', () => {
    const volume = new Volume(new FakeAudio());
    volume.set('instrument', -3);
    expect(volume.of('instrument')).toBe(0);
    volume.set('instrument', 12);
    expect(volume.of('instrument')).toBe(1);
    volume.set('metronome', Number.NaN);
    expect(volume.of('metronome')).toBe(1);
  });

  it('tells its listeners of a change, and of nothing when nothing changed', () => {
    const volume = new Volume(new FakeAudio());
    let changes = 0;
    const stop = volume.onChange(() => changes++);
    volume.set('instrument', 0.5);
    volume.set('instrument', 0.5);
    volume.set('metronome', 1);
    expect(changes).toBe(1);
    stop();
    volume.set('instrument', 0.2);
    expect(changes).toBe(1);
  });
});

describe('volumeGain', () => {
  it('is silent at 0 and untouched at 1', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
  });

  it('goes by the square, so half way on the slider sounds about half as loud', () => {
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(0.8)).toBeCloseTo(0.64);
  });

  it('keeps within range', () => {
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(3)).toBe(1);
  });
});
