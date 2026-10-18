import { describe, expect, it, vi } from 'vitest';
import { ALL_FILES, DECODED_FOR_ONE_NOTE, PITCHES, SAMPLE_SECONDS, ctx, fallback, network, piano, ready, settled, toPlay, toPrepare, useSamplerPiano } from './samplerPiano';

/*
 * The sampled piano getting its sound: what it fetches and in what order, what it decodes and how
 * much of it it keeps, and what plays meanwhile or when the samples never come. The network and
 * the browser's audio are stand-ins here; the arithmetic of the set is in pianoSamples.test.ts.
 */

useSamplerPiano();

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
      // Middle C from the base layer, its knock and ring, the pedal going down and up, and the metronome's clicks.
      await vi.waitFor(() => expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE));
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
      await vi.waitFor(() => expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE));
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
      await vi.waitFor(() => expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE));
      // Faster (the notes get shorter), then as it was.
      for (const seconds of [2, 2.5]) {
        piano.prepare([toPrepare(60, 0.8, seconds)]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(piano.status).toBe('ready');
      }
      expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE);
    });

    it('cuts a long sample down for much shorter notes, without decoding it again', async () => {
      piano.prepare([toPrepare(60, 0.8, 30)]);
      piano.start('/piano/');
      await settled();
      await vi.waitFor(() => expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE));

      piano.prepare([toPrepare(60, 0.8, 0.5)]);
      expect(piano.status).toBe('ready');
      piano.playNote(toPlay(60));
      expect(ctx.sources[0].buffer!.seconds).toBeLessThan(SAMPLE_SECONDS);
      expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE);
    });
  });

});
