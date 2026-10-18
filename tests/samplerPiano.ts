import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { NoteToPlay } from '../src/application/ports/AudioOutput';
import type { NoteToPrepare } from '../src/application/ports/Instrument';
import type { PianoManifest } from '../src/infrastructure/audio/pianoSamples';
import { SamplerPiano } from '../src/infrastructure/audio/SamplerPiano';
import { FakeAudio } from './fakes';

/*
 * The sampled piano for its tests: the browser's audio and the network as stand-ins, a small set of
 * samples, and a piano made afresh for each test (useSamplerPiano).
 */


/** Sound is decoded at this many samples a second here: enough to count seconds, little to hold. */
export const RATE = 1000;
/** Every recorded sample is this long. */
export const SAMPLE_SECONDS = 12;

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

export const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
export const node = () => ({ connect: <T>(to: T) => to, disconnect() {} });

interface FakeSource {
  buffer: FakeBuffer | null;
  playbackRate: { value: number };
  startedAt: number | null;
  onended: (() => void) | null;
}

/** As much of the browser's audio as the piano uses: it decodes any file into a steady tone, and remembers what was played. */
export class FakeContext {
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
export const PITCHES = [57, 60, 63];
export const manifest: PianoManifest = {
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
    metronome: { version: 'tick', accent: 'metronome/accent.wav', beat: 'metronome/beat.wav' },
  },
};
export const ALL_FILES = 6 + 3 + 6 + 2 + 2;
/** What a piece of one note needs decoded: its key from the base layer, the key's knock and ring, the pedal down and up, and the metronome's two clicks. */
export const DECODED_FOR_ONE_NOTE = 7;

/** The network: what was asked for, in order, and which addresses fail (and how many times). */
export class FakeNetwork {
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

export const toPrepare = (pitch: number, velocity = 0.8, seconds = 1): NoteToPrepare => ({ pitch, velocity, seconds });
export const toPlay = (pitch: number, velocity = 0.8): NoteToPlay => ({ pitch, velocity, at: 0, duration: 1, soft: false, held: 1 });

export let ctx: FakeContext;
export let fallback: FakeAudio;
export let network: FakeNetwork;
export let piano: SamplerPiano;

/** Sets a piano up before each test of the file, with a network and an audio of stand-ins, and takes it down after. */
export function useSamplerPiano(): void {
beforeEach(() => {
  ctx = new FakeContext();
  fallback = new FakeAudio();
  network = new FakeNetwork();
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  piano = new SamplerPiano(ctx as unknown as AudioContext, fallback);
});

afterEach(() => {
  // A piano goes on fetching the rest of its set after a test has seen what it came for: left on,
  // it would ask the next test's network, and be counted among that test's requests.
  piano.setEnabled(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
}

export const ready = () => vi.waitFor(() => expect(piano.status).toBe('ready'));
/** Everything asked for has arrived and nothing more is on its way. */
export const settled = () => vi.waitFor(() => expect(network.files.length).toBe(ALL_FILES));
