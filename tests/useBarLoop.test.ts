// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { Playback } from '../src/application/use-cases/Playback';
import { odeToJoy } from '../src/demo/odeToJoy';
import { barRange, writtenBarNumber, type Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import type { BarLoop } from '../src/ui/composables/useBarLoop';
import { FakeAudio, FakeTicker } from './fakes';

/*
 * The bar loop the transport's fields and the staff share. Bars are printed bar numbers; with
 * repeats one printed bar is played more than once, and the loop takes the pass that was meant.
 */

const showcase = (): Score => {
  const file = readFileSync('public/demos/showcase.musicxml');
  return new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
};

let playback: Playback;
let loop: BarLoop;

/** The loop is one for the whole app: each test gets the app anew. */
async function open(score: Score): Promise<void> {
  vi.resetModules();
  const { useBarLoop } = await import('../src/ui/composables/useBarLoop');
  playback = new Playback(new FakeAudio(), new FakeTicker());
  playback.load(score);
  loop = useBarLoop(playback);
}

describe('useBarLoop', () => {
  const ode = odeToJoy('Ode to Joy');
  beforeEach(() => open(ode));

  it('starts off, on the first four bars', () => {
    expect(loop.enabled.value).toBe(false);
    expect([loop.from.value, loop.to.value]).toEqual([1, 4]);
    expect(playback.loop).toBeNull();
  });

  it('is the same loop for everyone who asks', async () => {
    const { useBarLoop } = await import('../src/ui/composables/useBarLoop');
    expect(useBarLoop(playback)).toBe(loop);
  });

  it('loops the bars of its fields when switched on, and nothing when switched off', async () => {
    loop.enabled.value = true;
    await nextTick();
    expect(playback.loop).toEqual(barRange(ode, 0, 3));

    loop.setFrom(2);
    loop.setTo(3);
    await nextTick();
    expect(playback.loop).toEqual(barRange(ode, 1, 2));

    loop.enabled.value = false;
    await nextTick();
    expect(playback.loop).toBeNull();
  });

  it('keeps the fields for later while it is off', async () => {
    loop.setFrom(3);
    loop.setTo(5);
    await nextTick();
    expect(playback.loop).toBeNull();
    loop.enabled.value = true;
    await nextTick();
    expect(playback.loop).toEqual(barRange(ode, 2, 4));
  });

  describe('bars selected on the staff', () => {
    it('loop at once, whichever way they were dragged over', () => {
      loop.select(6, 3, 0);
      expect(loop.enabled.value).toBe(true);
      expect([loop.from.value, loop.to.value]).toEqual([3, 6]);
      // No waiting for the next tick: a seek right after must see the new loop.
      expect(playback.loop).toEqual(barRange(ode, 2, 5));
    });

    it('take the pass of a repeat they were selected on', async () => {
      const score = showcase();
      await open(score);
      // A printed bar that is played twice.
      const passes = (written: number) => score.barWritten.flatMap((w, index) => (w === written ? [index] : []));
      const written = score.barWritten.find((w) => passes(w).length > 1)!;
      const [first, second] = passes(written);
      const number = writtenBarNumber(score, written);

      loop.select(number, number, score.bars[second] + 0.01);
      expect(playback.loop).toEqual(barRange(score, second, second));
      loop.select(number, number, score.bars[first] + 0.01);
      expect(playback.loop).toEqual(barRange(score, first, first));
    });

    it('give way to the fields: typed in by hand, bars are taken near where playback is', async () => {
      const score = showcase();
      await open(score);
      const passes = (written: number) => score.barWritten.flatMap((w, index) => (w === written ? [index] : []));
      const written = score.barWritten.find((w) => passes(w).length > 1)!;
      const [first, second] = passes(written);
      const number = writtenBarNumber(score, written);

      loop.select(number, number, score.bars[second] + 0.01);
      expect(playback.loop?.start).toBe(score.bars[second]);
      // Back to the start of the piece, nearer to the first pass, and a bar typed into a field.
      loop.jumpTo(0);
      loop.setTo(number + 1);
      loop.enabled.value = true;
      await nextTick();
      expect(playback.loop?.start).toBe(score.bars[first]);
    });
  });

  describe('a jump in the music', () => {
    beforeEach(() => loop.select(2, 3, 0));

    it('inside the loop keeps it', () => {
      const inside = playback.loop!.start + 0.1;
      loop.jumpTo(inside);
      expect(loop.enabled.value).toBe(true);
      expect(playback.loop).toEqual(barRange(ode, 1, 2));
      expect(playback.position).toBeCloseTo(inside);
    });

    it('out of the loop switches it off and goes there', () => {
      for (const outside of [0, playback.loop!.end]) {
        loop.select(2, 3, 0);
        loop.jumpTo(outside);
        expect(loop.enabled.value).toBe(false);
        expect(playback.loop).toBeNull();
        expect(playback.position).toBeCloseTo(outside);
      }
    });
  });

  it('is switched off by another piece', async () => {
    loop.select(2, 3, 0);
    playback.load(showcase());
    expect(loop.enabled.value).toBe(false);
    await nextTick();
    expect(playback.loop).toBeNull();
  });
});
