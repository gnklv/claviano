// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { Playback } from '../src/application/use-cases/Playback';
import { odeToJoy } from '../src/demo/odeToJoy';
import { barRange, EMPTY_SCORE, writtenBarNumber, type Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { stepBar } from '../src/application/use-cases/stepBar';
import { useBarLoop } from '../src/ui/composables/useBarLoop';
import { FakeAudio, FakeTicker } from './fakes';

/*
 * The bar loop the transport's fields and the staff share, on a real Playback with a stand-in sound. Bars are printed bar numbers; with
 * repeats one printed bar is played more than once, and the loop takes the pass that was meant.
 */

const showcase = (): Score => {
  const file = readFileSync('public/demos/showcase.musicxml');
  return new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
};

const ode = odeToJoy('Ode to Joy');

let playback: Playback;
let loop: BarLoop;

function open(score: Score): void {
  playback = new Playback(new FakeAudio(), new FakeTicker());
  playback.load(score);
  loop = new BarLoop(playback);
}

describe('BarLoop', () => {
  beforeEach(() => open(ode));

  it('starts off, on the first four bars', () => {
    expect(loop.enabled).toBe(false);
    expect([loop.from, loop.to]).toEqual([1, 4]);
    expect(playback.loop).toBeNull();
  });

  it('loops the bars of its fields when switched on, and nothing when switched off', () => {
    loop.setEnabled(true);
    expect(playback.loop).toEqual(barRange(ode, 0, 3));

    loop.setFrom(2);
    loop.setTo(3);
    expect(playback.loop).toEqual(barRange(ode, 1, 2));

    loop.setEnabled(false);
    expect(playback.loop).toBeNull();
  });

  it('keeps the fields for later while it is off', () => {
    loop.setFrom(3);
    loop.setTo(5);
    expect(playback.loop).toBeNull();
    loop.setEnabled(true);
    expect(playback.loop).toEqual(barRange(ode, 2, 4));
  });

  describe('bars selected on the staff', () => {
    it('loop at once, whichever way they were dragged over', () => {
      loop.select(6, 3, 0);
      expect(loop.enabled).toBe(true);
      expect([loop.from, loop.to]).toEqual([3, 6]);
      expect(playback.loop).toEqual(barRange(ode, 2, 5));
    });

    it('take the pass of a repeat they were selected on', () => {
      const score = showcase();
      open(score);
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

    it('give way to the fields: typed in by hand, bars are taken near where playback is', () => {
      const score = showcase();
      open(score);
      const passes = (written: number) => score.barWritten.flatMap((w, index) => (w === written ? [index] : []));
      const written = score.barWritten.find((w) => passes(w).length > 1)!;
      const [first, second] = passes(written);
      const number = writtenBarNumber(score, written);

      loop.select(number, number, score.bars[second] + 0.01);
      expect(playback.loop?.start).toBe(score.bars[second]);
      // Back to the start of the piece, nearer to the first pass, and a bar typed into a field.
      loop.jumpTo(0);
      loop.setTo(number + 1);
      loop.setEnabled(true);
        expect(playback.loop?.start).toBe(score.bars[first]);
    });
  });

  describe('a jump in the music', () => {
    beforeEach(() => loop.select(2, 3, 0));

    it('inside the loop keeps it', () => {
      const inside = playback.loop!.start + 0.1;
      loop.jumpTo(inside);
      expect(loop.enabled).toBe(true);
      expect(playback.loop).toEqual(barRange(ode, 1, 2));
      expect(playback.position).toBeCloseTo(inside);
    });

    it('out of the loop switches it off and goes there', () => {
      for (const outside of [0, playback.loop!.end]) {
        loop.select(2, 3, 0);
        loop.jumpTo(outside);
        expect(loop.enabled).toBe(false);
        expect(playback.loop).toBeNull();
        expect(playback.position).toBeCloseTo(outside);
      }
    });
  });

  it('tells its listeners what changed, and nothing when nothing did', () => {
    let changes = 0;
    const stop = loop.onChange(() => changes++);
    loop.setEnabled(true);
    loop.setEnabled(true);
    loop.setFrom(2);
    loop.setFrom(2);
    loop.setTo(3);
    expect(changes).toBe(3);
    loop.select(1, 2, 0);
    loop.jumpTo(playback.loop!.end + 1);
    expect(changes).toBe(5);
    stop();
    loop.setEnabled(true);
    expect(changes).toBe(5);
  });

  it('does not restart the music when a field is set to what it already says', () => {
    loop.select(2, 3, 0);
    const audio = new FakeAudio();
    playback = new Playback(audio, new FakeTicker());
    playback.load(ode);
    loop = new BarLoop(playback);
    loop.select(2, 3, 0);
    void playback.play();
    const stops = audio.stops;
    loop.setFrom(2);
    loop.setTo(3);
    loop.setEnabled(true);
    expect(audio.stops).toBe(stops);
  });

  it('is switched off by another piece', () => {
    loop.select(2, 3, 0);
    playback.load(showcase());
    expect(loop.enabled).toBe(false);
    expect(playback.loop).toBeNull();
  });

  it('has nothing to loop before a piece is open', () => {
    playback = new Playback(new FakeAudio(), new FakeTicker());
    loop = new BarLoop(playback);
    loop.setEnabled(true);
    loop.jumpTo(3);
    expect(playback.loop).toBeNull();
  });
});

describe('stepBar', () => {
  beforeEach(() => open(ode));

  it('goes to the start of the next bar, or of the one before', () => {
    stepBar(playback, 1);
    expect(playback.position).toBeCloseTo(ode.bars[1]);
    stepBar(playback, 1);
    expect(playback.position).toBeCloseTo(ode.bars[2]);
    stepBar(playback, -1);
    expect(playback.position).toBeCloseTo(ode.bars[1]);
  });

  it('from inside a bar goes back to the bar before, not to the start of its own', () => {
    playback.seek((ode.bars[2] + ode.bars[3]) / 2);
    stepBar(playback, -1);
    expect(playback.position).toBeCloseTo(ode.bars[1]);
  });

  it('stays within the piece', () => {
    stepBar(playback, -1);
    expect(playback.position).toBe(0);
    stepBar(playback, 1000);
    expect(playback.position).toBeCloseTo(ode.bars[ode.bars.length - 1]);
  });

  it('does nothing without a piece, or in an empty one', () => {
    playback = new Playback(new FakeAudio(), new FakeTicker());
    stepBar(playback, 1);
    playback.load(EMPTY_SCORE);
    stepBar(playback, 1);
    expect(playback.position).toBe(0);
  });
});

describe('useBarLoop', () => {
  beforeEach(() => open(ode));

  it('mirrors the loop for templates, and switches it through its switch', () => {
    const scope = effectScope();
    const mirror = scope.run(() => useBarLoop(loop))!;
    expect([mirror.enabled.value, mirror.from.value, mirror.to.value]).toEqual([false, 1, 4]);

    loop.select(2, 3, 0);
    expect([mirror.enabled.value, mirror.from.value, mirror.to.value]).toEqual([true, 2, 3]);

    mirror.enabled.value = false;
    expect(loop.enabled).toBe(false);
    expect(playback.loop).toBeNull();

    // Out of use (its component is gone), it no longer listens.
    scope.stop();
    loop.setEnabled(true);
    expect(mirror.enabled.value).toBe(false);
  });
});
