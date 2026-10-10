import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteToPlay } from '../src/application/ports/AudioOutput';
import type { NoteToPrepare } from '../src/application/ports/Instrument';
import type { PianoManifest } from '../src/infrastructure/audio/pianoSamples';
import { SamplerPiano } from '../src/infrastructure/audio/SamplerPiano';
import { FakeAudio } from './fakes';

/*
 * The sampled piano getting its sound: what it fetches and in what order, what it decodes and how
 * much of it it keeps, and what plays meanwhile or when the samples never come. The network and
 * the browser's audio are stand-ins here; the arithmetic of the set is in pianoSamples.test.ts.
 */

/** Sound is decoded at this many samples a second here: enough to count seconds, little to hold. */
const RATE = 1000;
/** Every recorded sample is this long. */
const SAMPLE_SECONDS = 12;

class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get seconds(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect: <T>(to: T) => to, disconnect() {} });

interface FakeSource {
  buffer: FakeBuffer | null;
  playbackRate: { value: number };
  startedAt: number | null;
  onended: (() => void) | null;
}

/** As much of the browser's audio as the piano uses: it decodes any file into a steady tone, and remembers what was played. */
class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = node();
  decodes = 0;
  sources: FakeSource[] = [];
  createGain = () => ({ ...node(), gain: param() });
  createDynamicsCompressor = () => ({ ...node(), threshold: param(), ratio: param() });
  createBiquadFilter = () => ({ ...node(), type: '', frequency: param() });
  createBuffer = (channels: number, length: number, rate: number) => new FakeBuffer(channels, length, rate);
  createBufferSource = () => {
    const source = {
      ...node(),
      buffer: null,
      playbackRate: param(),
      startedAt: null as number | null,
      onended: null,
      start(at: number) {
        source.startedAt = at;
      },
      stop() {},
    };
    this.sources.push(source);
    return source;
  };
  decodeAudioData = (_bytes: ArrayBuffer) => {
    this.decodes++;
    const buffer = new FakeBuffer(2, SAMPLE_SECONDS * RATE, RATE);
    for (const channel of buffer.channels) channel.fill(0.5);
    return Promise.resolve(buffer);
  };
  resume = () => Promise.resolve();
}

/** A small set: three recorded keys (A3, C4, D#4) in a soft and a loud layer, and the small sounds. */
const PITCHES = [57, 60, 63];
const manifest: PianoManifest = {
  name: 'Test piano',
  author: 'nobody',
  license: 'none',
  version: 'abc',
  base: 'loud',
  layers: [
    { id: 'soft', velocity: [1, 60], notes: PITCHES.map((pitch) => ({ pitch, file: `soft/${pitch}.mp3`, bytes: 8 })) },
    { id: 'loud', velocity: [61, 127], notes: PITCHES.map((pitch) => ({ pitch, file: `loud/${pitch}.mp3`, bytes: 8 })) },
  ],
  extras: {
    release: [59, 60, 61].map((pitch) => ({ pitch, file: `release/${pitch}.mp3` })),
    resonance: {
      splitVelocity: 60,
      soft: PITCHES.map((pitch) => ({ pitch, file: `ring-soft/${pitch}.mp3` })),
      loud: PITCHES.map((pitch) => ({ pitch, file: `ring-loud/${pitch}.mp3` })),
    },
    pedal: { down: ['pedal/down.mp3'], up: ['pedal/up.mp3'] },
  },
};
const ALL_FILES = 6 + 3 + 6 + 2;

/** The network: what was asked for, in order, and which addresses fail (and how many times). */
class FakeNetwork {
  requests: string[] = [];
  failures = new Map<string, number>();
  inFlight = 0;
  mostInFlight = 0;

  fetch = async (url: string): Promise<Response> => {
    this.requests.push(url);
    this.inFlight++;
    this.mostInFlight = Math.max(this.mostInFlight, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.inFlight--;
    const file = url.replace(/^\/piano\//, '').replace(/\?.*$/, '');
    const left = this.failures.get(file) ?? 0;
    if (left > 0) {
      this.failures.set(file, left - 1);
      return new Response('', { status: 404 });
    }
    return file === 'manifest.json' ? new Response(JSON.stringify(manifest)) : new Response(new ArrayBuffer(8));
  };

  /** The sample files asked for, without the folder and the version. */
  get files(): string[] {
    return this.requests.map((url) => url.replace(/^\/piano\//, '').replace(/\?.*$/, '')).filter((file) => file !== 'manifest.json');
  }
}

const toPrepare = (pitch: number, velocity = 0.8, seconds = 1): NoteToPrepare => ({ pitch, velocity, seconds });
const toPlay = (pitch: number, velocity = 0.8): NoteToPlay => ({ pitch, velocity, at: 0, duration: 1, soft: false, held: 1 });

let ctx: FakeContext;
let fallback: FakeAudio;
let network: FakeNetwork;
let piano: SamplerPiano;

beforeEach(() => {
  ctx = new FakeContext();
  fallback = new FakeAudio();
  network = new FakeNetwork();
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  piano = new SamplerPiano(ctx as unknown as AudioContext, fallback);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ready = () => vi.waitFor(() => expect(piano.status).toBe('ready'));
/** Everything asked for has arrived and nothing more is on its way. */
const settled = () => vi.waitFor(() => expect(network.files.length).toBe(ALL_FILES));

describe('SamplerPiano', () => {
  describe('until the samples are in', () => {
    it('is loading, and the fallback plays', () => {
      expect(piano.status).toBe('loading');
      piano.playNote(toPlay(60));
      expect(fallback.played.map((note) => note.pitch)).toEqual([60]);
      expect(ctx.sources).toEqual([]);
    });

    it('fetches nothing before it is told where the samples are', async () => {
      piano.prepare([toPrepare(60)]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(network.requests).toEqual([]);
    });
  });

  describe('getting ready for a piece', () => {
    it('reads the manifest, then the base layer of the piece’s keys before anything else', async () => {
      piano.prepare([toPrepare(60), toPrepare(63, 0.2)]);
      piano.start('/piano/');
      await ready();
      expect(network.requests[0]).toBe('/piano/manifest.json');
      // Middle C first (the middle of the keyboard), then the other key: both from the base layer.
      expect(network.files.slice(0, 2)).toEqual(['loud/60.mp3', 'loud/63.mp3']);
      // Then the soft note's own layer.
      expect(network.files[2]).toBe('soft/63.mp3');
    });

    it('asks for the files by the set’s version, so a rebuilt set is fetched anew', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await ready();
      expect(network.requests[1]).toBe('/piano/loud/60.mp3?v=abc');
    });

    it('tells its listeners when it is ready, and then plays the samples', async () => {
      const statuses: string[] = [];
      piano.onChange(() => statuses.push(piano.status));
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await ready();
      expect(statuses).toEqual(['ready']);

      piano.playNote(toPlay(60));
      expect(fallback.played).toEqual([]);
      expect(ctx.sources.length).toBeGreaterThan(0);
      expect(ctx.sources[0].startedAt).toBe(0);
    });

    it('plays a key that was not recorded from its neighbour, a little faster', async () => {
      piano.prepare([toPrepare(61)]);
      piano.start('/piano/');
      await ready();
      expect(network.files[0]).toBe('loud/60.mp3');
      piano.playNote(toPlay(61));
      expect(ctx.sources[0].playbackRate.value).toBeCloseTo(2 ** (1 / 12));
    });

    it('fetches the whole set in the end, but decodes only what the piece needs', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await settled();
      await ready();
      expect(new Set(network.files).size).toBe(ALL_FILES);
      // Middle C from the base layer, its knock and ring, and the pedal going down and up.
      await vi.waitFor(() => expect(ctx.decodes).toBe(5));
    });

    it('never has more than a few files on their way at once', async () => {
      piano.prepare(PITCHES.map((pitch) => toPrepare(pitch)));
      piano.start('/piano/');
      await settled();
      expect(network.mostInFlight).toBeLessThanOrEqual(4);
      expect(network.mostInFlight).toBeGreaterThan(1);
    });

    it('keeps no more of a sample than the piece’s notes sound', async () => {
      piano.prepare([toPrepare(60, 0.8, 0.5)]);
      piano.start('/piano/');
      await ready();
      piano.playNote(toPlay(60));
      const kept = ctx.sources[0].buffer!.seconds;
      expect(kept).toBeLessThan(SAMPLE_SECONDS);
      expect(kept).toBeGreaterThanOrEqual(1.5);
    });

    it('keeps all of a sample for a note held to its end', async () => {
      piano.prepare([toPrepare(60, 0.8, 30)]);
      piano.start('/piano/');
      await ready();
      piano.playNote(toPlay(60));
      expect(ctx.sources[0].buffer!.seconds).toBe(SAMPLE_SECONDS);
    });

    it('keeps the small sounds short and in mono', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await vi.waitFor(() => expect(ctx.decodes).toBe(5));
      await ready();
      piano.playPedal(0, true);
      const noise = ctx.sources[0].buffer!;
      expect(noise.numberOfChannels).toBe(1);
      expect(noise.seconds).toBeLessThanOrEqual(2);
      // Both channels were the same tone: mixed into one, it is as loud as before.
      expect(noise.channels[0][0]).toBeCloseTo(0.5);
    });
  });

  describe('another piece', () => {
    it('decodes what it needs anew, from the files already here', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await settled();
      await ready();
      const fetched = network.requests.length;

      piano.prepare([toPrepare(57)]);
      expect(piano.status).toBe('loading');
      await ready();
      expect(network.requests.length).toBe(fetched);
      piano.playNote(toPlay(57));
      expect(fallback.played).toEqual([]);
    });

    it('lets go of what the piece before needed', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await settled();
      await ready();

      piano.prepare([toPrepare(57)]);
      await ready();
      // Middle C is not decoded any more: the fallback plays it.
      piano.playNote(toPlay(60));
      expect(fallback.played.map((note) => note.pitch)).toEqual([60]);
    });

    it('decodes nothing again when the tempo moves a little and back', async () => {
      piano.prepare([toPrepare(60, 0.8, 2.5)]);
      piano.start('/piano/');
      await settled();
      await vi.waitFor(() => expect(ctx.decodes).toBe(5));
      // Faster (the notes get shorter), then as it was.
      for (const seconds of [2, 2.5]) {
        piano.prepare([toPrepare(60, 0.8, seconds)]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(piano.status).toBe('ready');
      }
      expect(ctx.decodes).toBe(5);
    });

    it('cuts a long sample down for much shorter notes, without decoding it again', async () => {
      piano.prepare([toPrepare(60, 0.8, 30)]);
      piano.start('/piano/');
      await settled();
      await vi.waitFor(() => expect(ctx.decodes).toBe(5));

      piano.prepare([toPrepare(60, 0.8, 0.5)]);
      expect(piano.status).toBe('ready');
      piano.playNote(toPlay(60));
      expect(ctx.sources[0].buffer!.seconds).toBeLessThan(SAMPLE_SECONDS);
      expect(ctx.decodes).toBe(5);
    });
  });

  describe('switched off', () => {
    it('fetches nothing and lets the fallback play; switched on, it begins', async () => {
      piano.setEnabled(false);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(network.requests).toEqual([]);

      piano.setEnabled(true);
      await ready();
      expect(network.requests[0]).toBe('/piano/manifest.json');
    });

    it('hands a ready piano’s notes to the fallback, and takes them back when switched on', async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await ready();
      const changes: boolean[] = [];
      piano.onChange(() => changes.push(piano.enabled));

      piano.setEnabled(false);
      piano.playNote(toPlay(60));
      piano.playPedal(0, true);
      expect(fallback.played.length).toBe(1);
      expect(ctx.sources).toEqual([]);

      piano.setEnabled(true);
      piano.playNote(toPlay(60));
      expect(fallback.played.length).toBe(1);
      expect(ctx.sources.length).toBeGreaterThan(0);
      expect(changes).toEqual([false, true]);
    });
  });

  describe('when the samples do not come', () => {
    it('is unavailable without the manifest, and the fallback plays', async () => {
      network.failures.set('manifest.json', 1);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await vi.waitFor(() => expect(piano.status).toBe('unavailable'));
      expect(console.warn).toHaveBeenCalledOnce();
      piano.playNote(toPlay(60));
      expect(fallback.played.length).toBe(1);
    });

    it('asks once more for a sample that failed to arrive', async () => {
      network.failures.set('loud/60.mp3', 1);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await ready();
      expect(network.files.filter((file) => file === 'loud/60.mp3').length).toBe(2);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('gives up on a sample that fails twice: unavailable, the fallback plays', async () => {
      network.failures.set('loud/60.mp3', 2);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await vi.waitFor(() => expect(piano.status).toBe('unavailable'));
      piano.playNote(toPlay(60));
      expect(fallback.played.length).toBe(1);
    });

    it('goes on playing what is in when something else fails later', async () => {
      network.failures.set('pedal/up.mp3', 2);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
      expect(piano.status).toBe('ready');
      piano.playNote(toPlay(60));
      expect(fallback.played).toEqual([]);
    });
  });

  describe('volume', () => {
    it('turns the samples and the fallback up and down together: they are one instrument', () => {
      const setTarget = vi.fn();
      const quiet = new FakeContext();
      quiet.createGain = () => ({ ...node(), gain: { ...param(), setTargetAtTime: setTarget } });
      piano = new SamplerPiano(quiet as unknown as AudioContext, fallback);
      piano.setVolume('instrument', 0.5);
      expect(fallback.volumes).toEqual({ instrument: 0.5 });
      // Half way on the slider is a quarter of the gain: about half as loud to the ear.
      expect(setTarget.mock.calls[0][0]).toBeCloseTo(0.5 * 0.25);
    });

    it('leaves the metronome to the fallback, which makes the clicks', () => {
      piano.setVolume('metronome', 0.4);
      expect(fallback.volumes).toEqual({ metronome: 0.4 });
    });
  });

  it('always leaves the metronome’s clicks to the fallback', async () => {
    piano.prepare([toPrepare(60)]);
    piano.start('/piano/');
    await ready();
    piano.playClick(1, true);
    expect(fallback.clicks).toEqual([{ at: 1, accent: true }]);
  });

  it('stops the fallback too when told to be silent', async () => {
    piano.prepare([toPrepare(60)]);
    piano.start('/piano/');
    await ready();
    piano.playNote(toPlay(60));
    piano.stopAll();
    expect(fallback.stops).toBe(1);
  });
});
