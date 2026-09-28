// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beatsOf, countIn, metronomeClicks } from '../src/domain/metronome';
import type { Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';

const whole = (beat: number): Note => ({ pitch: 60, start: beat, duration: 4, beat, beats: 4, velocity: 0.8, hand: 'right' });
/** Two bars of 4/4 at 60 BPM: a beat is a second. */
const twoBars = createScore('t', [whole(0), whole(4)], [0, 4], { barBeats: [0, 4] });

const file = readFileSync('public/demos/showcase.musicxml');
const showcase = new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
const clicks = metronomeClicks(showcase);
/** Clicks of bar `index` as played (index = printed number up to bar 18, thanks to the pickup). */
const clicksIn = (index: number) =>
  clicks.filter((c) => c.time >= showcase.bars[index] - 1e-9 && c.time < (showcase.bars[index + 1] ?? Infinity) - 1e-9);

describe('beatsOf', () => {
  it('counts simple metres by their note value and compound ones by dotted quarters', () => {
    const of = (numerator: number, denominator: number) => beatsOf({ beat: 0, numerator, denominator });
    expect(of(4, 4)).toEqual({ count: 4, length: 1 });
    expect(of(3, 8)).toEqual({ count: 3, length: 0.5 });
    expect(of(2, 2)).toEqual({ count: 2, length: 2 });
    expect(of(6, 8)).toEqual({ count: 2, length: 1.5 });
    expect(of(9, 8)).toEqual({ count: 3, length: 1.5 });
    expect(of(12, 8)).toEqual({ count: 4, length: 1.5 });
  });
});

describe('metronomeClicks', () => {
  it('clicks every beat, accenting the first of each bar', () => {
    expect(metronomeClicks(twoBars).map((c) => [c.time, c.accent])).toEqual([
      [0, true],
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [5, false],
      [6, false],
      [7, false],
    ]);
  });

  it('counts a pickup from the end of its bar', () => {
    // The showcase opens with two eighths in 4/4: they fall on the fourth beat, unaccented.
    expect(clicksIn(0).map((c) => [c.time, c.accent])).toEqual([[0, false]]);
    expect(clicksIn(1)[0]).toMatchObject({ time: showcase.bars[1], accent: true });
  });

  it('counts 6/8 in two dotted quarters', () => {
    expect(clicksIn(10)).toHaveLength(2);
    expect(clicksIn(10).map((c) => c.accent)).toEqual([true, false]);
  });

  it('waits during a fermata', () => {
    // Bar 15 holds a half note on beats 3–4: the fourth beat is not clicked.
    expect(clicksIn(15)).toHaveLength(3);
  });

  it('follows the bars as played, repeats included', () => {
    const accents = clicks.filter((c) => c.accent).length;
    expect(accents).toBe(showcase.bars.length - 1); // every bar but the pickup
  });
});

describe('countIn', () => {
  const summary = (clicks: ReturnType<typeof countIn>) => clicks.map((c) => [Math.round(c.before * 1000) / 1000, c.count]);

  it('counts a whole bar before the start of a bar', () => {
    expect(summary(countIn(twoBars, 0))).toEqual([
      [4, 1],
      [3, 2],
      [2, 3],
      [1, 4],
    ]);
  });

  it('counts up to the beat where the music comes in', () => {
    // Starting on the third beat: "1 2", then the music.
    expect(summary(countIn(twoBars, 2))).toEqual([
      [2, 1],
      [1, 2],
    ]);
    // Starting between beats 2 and 3: the clicks keep to the beat grid.
    expect(summary(countIn(twoBars, 1.5))).toEqual([
      [1.5, 1],
      [0.5, 2],
    ]);
  });

  it('adds a whole bar when fewer than two beats would lead in', () => {
    expect(summary(countIn(twoBars, 1)).map(([, count]) => count)).toEqual([1, 2, 3, 4, 1]);
  });

  it('counts a pickup on the fourth beat "1 2 3"', () => {
    const clicks = countIn(showcase, 0);
    expect(clicks.map((c) => c.count)).toEqual([1, 2, 3]);
    expect(clicks[0].before).toBeCloseTo(2); // three quarters at 90 per minute
  });

  it('counts 6/8 in dotted quarters, at the pace there', () => {
    const clicks = countIn(showcase, showcase.bars[10]);
    expect(clicks.map((c) => c.count)).toEqual([1, 2]);
    expect(clicks[0].before).toBeCloseTo(2); // a dotted quarter at 90 quarters per minute lasts a second
  });
});
