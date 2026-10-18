import { describe, expect, it, vi } from 'vitest';
import { SamplerPiano } from '../src/infrastructure/audio/SamplerPiano';
import { allDone, ctx, DECODED_FOR_ONE_NOTE, FakeContext, fallback, network, node, param, piano, ready, toPlay, toPrepare, useSamplerPiano } from './samplerPiano';

/* The sampled piano switched off, without its samples, at another volume, and as the metronome. */

useSamplerPiano();

describe('SamplerPiano', () => {
  describe('switched off', () => {
    it('fetches nothing and lets the fallback play; switched on, it begins', async () => {
      piano.setEnabled(false);
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await allDone();
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
      // (A piano of its own, never switched on: it fetches nothing.)
      new SamplerPiano(quiet as unknown as AudioContext, fallback).setVolume('instrument', 0.5);
      expect(fallback.volumes).toEqual({ instrument: 0.5 });
      // Half way on the slider is a quarter of the gain: about half as loud to the ear.
      expect(setTarget.mock.calls[0][0]).toBeCloseTo(0.5 * 0.25);
    });

    it('turns the metronome up and down in the fallback too, which clicks until the recorded clicks are in', () => {
      piano.setVolume('metronome', 0.4);
      expect(fallback.volumes).toEqual({ metronome: 0.4 });
    });
  });

  describe('the metronome', () => {
    const clicksIn = async () => {
      piano.prepare([toPrepare(60)]);
      piano.start('/piano/');
      await vi.waitFor(() => expect(ctx.decodes).toBe(DECODED_FOR_ONE_NOTE));
    };

    it('clicks from the fallback until its own clicks are in', () => {
      piano.playClick(1, true);
      expect(fallback.clicks).toEqual([{ at: 1, accent: true }]);
      expect(ctx.sources).toEqual([]);
    });

    it('clicks from the recording once its clicks are in, asked for by their own version', async () => {
      await clicksIn();
      expect(network.requests).toContain('/piano/metronome/beat.wav?v=tick');
      expect(network.requests).toContain('/piano/metronome/accent.wav?v=tick');

      piano.playClick(1, false);
      expect(fallback.clicks).toEqual([]);
      expect(ctx.sources).toHaveLength(1);
      expect(ctx.sources[0].startedAt).toBe(1);
      // As recorded: not sped up or slowed down.
      expect(ctx.sources[0].playbackRate.value).toBe(1);
    });

    it('has one click for the first beat of a bar and another for the rest', async () => {
      await clicksIn();
      for (const accent of [true, false, false, false, true, false]) piano.playClick(0, accent);
      const [first, other] = ctx.sources.map((source) => source.buffer);
      expect(first).not.toBe(other);
      expect(ctx.sources.map((source) => source.buffer)).toEqual([first, other, other, other, first, other]);
    });

    it('clicks from the fallback when the piano is switched off', async () => {
      await clicksIn();
      piano.setEnabled(false);
      piano.playClick(1, false);
      expect(fallback.clicks).toHaveLength(1);
      expect(ctx.sources).toEqual([]);
    });
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
