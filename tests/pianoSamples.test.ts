import { describe, expect, it } from 'vitest';
import {
  describeSet,
  keptLength,
  layerFor,
  loadOrder,
  nearestRecorded,
  onsetSeconds,
  PEDAL_GAIN,
  playbackRate,
  releaseGain,
  resonanceGain,
  sampleLevel,
  samplesWanted,
  velocityGain,
} from '../src/infrastructure/audio/pianoSamples';

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

describe('loadOrder', () => {
  it('fetches what the piece needs first, then the rest, each from the middle outwards', () => {
    const order = loadOrder(recorded, new Set([21, 72, 63]));
    expect(order.slice(0, 3)).toEqual([63, 72, 21]);
    expect(order.slice(3, 7)).toEqual([60, 57, 54, 66]);
    expect(order).toHaveLength(30);
  });

  it('goes from the middle outwards when nothing is needed yet', () => {
    expect(loadOrder(recorded, new Set()).slice(0, 3)).toEqual([60, 57, 63]);
  });
});

/** A set like the real one: three layers of every third key, knocks for every key, rings up to D#6, two takes of the pedal. */
const set = describeSet({
  name: 'Test',
  author: '',
  license: '',
  version: '1',
  base: 'mid',
  layers: [
    { id: 'soft', velocity: [37, 43], notes: recorded.map((pitch) => ({ pitch, file: `soft/${pitch}.mp3`, bytes: 1 })) },
    { id: 'mid', velocity: [57, 64], notes: recorded.map((pitch) => ({ pitch, file: `mid/${pitch}.mp3`, bytes: 1 })) },
    { id: 'loud', velocity: [97, 104], notes: recorded.map((pitch) => ({ pitch, file: `loud/${pitch}.mp3`, bytes: 1 })) },
  ],
  extras: {
    release: Array.from({ length: 88 }, (_, i) => ({ pitch: 21 + i, file: `release/${21 + i}.mp3` })),
    resonance: {
      splitVelocity: 45,
      soft: recorded.filter((pitch) => pitch <= 87).map((pitch) => ({ pitch, file: `ring-soft/${pitch}.mp3` })),
      loud: recorded.filter((pitch) => pitch <= 87).map((pitch) => ({ pitch, file: `ring-loud/${pitch}.mp3` })),
    },
    pedal: { down: ['pedal/down1.mp3', 'pedal/down2.mp3'], up: ['pedal/up1.mp3', 'pedal/up2.mp3'] },
  },
});

describe('describeSet', () => {
  it('lists every file, each with the version in its address', () => {
    expect(set.files).toHaveLength(3 * 30 + 88 + 2 * 23 + 4);
    expect(set.layers[set.base].get(60)).toBe('mid/60.mp3?v=1');
    expect(set.recorded.map((v) => v.toFixed(2))).toEqual(['0.31', '0.48', '0.79']);
  });
});

describe('samplesWanted', () => {
  const file = (name: string) => `${name}.mp3?v=1`;

  it('wants the base layer of the notes\' pitches, each note\'s own layer, and the small sounds, in that order', () => {
    // Middle C and C sharp share a sample; the high one is struck hard.
    const { files, required, mono } = samplesWanted(set, [
      { pitch: 60, velocity: 0.5, seconds: 1 },
      { pitch: 61, velocity: 0.5, seconds: 1 },
      { pitch: 72, velocity: 0.9, seconds: 1 },
    ]);
    expect([...files.keys()]).toEqual([
      file('mid/60'),
      file('mid/72'),
      file('loud/72'),
      file('pedal/down1'),
      file('pedal/down2'),
      file('pedal/up1'),
      file('pedal/up2'),
      file('ring-loud/60'),
      file('ring-loud/72'),
      file('release/60'),
      file('release/61'),
      file('release/72'),
    ]);
    // With these alone the piano can play.
    expect([...required]).toEqual([file('mid/60'), file('mid/72')]);
    // The small sounds are kept in mono, the notes in stereo.
    expect(mono.has(file('release/60'))).toBe(true);
    expect(mono.has(file('pedal/down1'))).toBe(true);
    expect(mono.has(file('mid/60'))).toBe(false);
  });

  it('keeps of each sample only as long as its longest note sounds, a faster-played one used up sooner', () => {
    const { files } = samplesWanted(set, [
      { pitch: 60, velocity: 0.5, seconds: 0.5 },
      { pitch: 60, velocity: 0.5, seconds: 2.5 },
      { pitch: 61, velocity: 0.5, seconds: 4.9 }, // a semitone up: 4.9 s of music is 5.2 s of the sample
      { pitch: 21, velocity: 0.5, seconds: 20 },
    ]);
    expect(files.get(file('mid/60'))).toBe(8); // 5.2 s and a second for the release: the next length is 8
    expect(files.get(file('mid/21'))).toBe(Infinity); // all of it
    expect(files.get(file('release/60'))).toBe(2); // of the small sounds, the first two seconds
  });

  it('keeps each layer as long as its own notes need; the base layer at least three seconds, to stand in', () => {
    const { files } = samplesWanted(set, [
      { pitch: 60, velocity: 0.3, seconds: 7 }, // soft and long
      { pitch: 60, velocity: 0.9, seconds: 0.5 }, // loud and short
    ]);
    expect(files.get(file('soft/60'))).toBe(8);
    expect(files.get(file('loud/60'))).toBe(2);
    expect(files.get(file('mid/60'))).toBe(3);
  });

  it('rounds lengths up to a few steps, so a little slower tempo asks for nothing new', () => {
    expect([0.4, 1, 1.2, 2.9, 3.5, 5, 7.9, 9].map(keptLength)).toEqual([1, 1, 2, 3, 4, 6, 8, Infinity]);
  });

  it('wants nothing when there is nothing to play', () => {
    const { files, required } = samplesWanted(set, []);
    expect(files.size).toBe(0);
    expect(required.size).toBe(0);
  });

  it('has no ring for the top keys, whose strings have no dampers', () => {
    const { files } = samplesWanted(set, [{ pitch: 100, velocity: 0.5, seconds: 1 }]);
    expect([...files.keys()].some((name) => name.startsWith('ring'))).toBe(false);
  });
});

describe('layerFor', () => {
  const layers = [0.3, 0.5, 0.8];

  it('plays a note from the layer recorded nearest to its strike', () => {
    expect(layerFor(layers, 0.1)).toBe(0);
    expect(layerFor(layers, 0.45)).toBe(1);
    expect(layerFor(layers, 0.7)).toBe(2);
    expect(layerFor(layers, 1)).toBe(2);
  });
});

describe('sampleLevel', () => {
  it('is the RMS of the sound from its onset', () => {
    const silence = new Float32Array(100);
    const sound = new Float32Array(1000).fill(0.5);
    const channel = new Float32Array([...silence, ...sound]);
    expect(sampleLevel([channel, channel], 1000, 0.1)).toBeCloseTo(0.5);
  });

  it('is nothing for an empty sample', () => {
    expect(sampleLevel([new Float32Array(0)], 44100, 0)).toBe(0);
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

describe('the small sounds', () => {
  it('are far quieter than the notes', () => {
    expect(releaseGain(1, 0)).toBeLessThan(0.05);
    expect(PEDAL_GAIN).toBeLessThan(0.3);
  });

  it('are softer after a softer strike', () => {
    expect(releaseGain(0.3, 0.5)).toBeLessThan(releaseGain(0.9, 0.5));
    expect(resonanceGain(0.3, 0.5)).toBeLessThan(resonanceGain(0.9, 0.5));
  });

  it('are softer the longer the note has sounded', () => {
    expect(releaseGain(0.6, 3)).toBeLessThan(releaseGain(0.6, 0.2));
    // A second of sounding takes 7 dB off the ring.
    expect(resonanceGain(0.6, 1) / resonanceGain(0.6, 0)).toBeCloseTo(10 ** (-7 / 20));
  });
});
