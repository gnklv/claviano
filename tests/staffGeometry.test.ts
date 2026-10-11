// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { odeToJoy } from '../src/demo/odeToJoy';
import { engrave } from '../src/domain/notation/engraving';
import type { Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { columnsOf } from '../src/infrastructure/render/staff/columns';
import { StaffGeometry } from '../src/infrastructure/render/staff/geometry';

describe('the size of the staff', () => {
  const sized = (width: number, height: number) => {
    const geometry = new StaffGeometry();
    geometry.resize(width, height);
    return geometry;
  };
  const barsOnTape = (geometry: StaffGeometry) => (geometry.width - geometry.gutterWidth()) / geometry.barWidth();

  it('follows the height of the view, within limits', () => {
    expect(sized(1200, 240).space).toBe(10);
    expect(sized(1200, 100).space).toBe(6);
    expect(sized(1200, 900).space).toBe(14);
  });

  it('is smaller on a tall and narrow view, so that two bars and a bit are in sight', () => {
    const phone = sized(402, 545);
    expect(phone.space).toBeLessThan(10);
    expect(phone.space).toBeGreaterThan(8);
    expect(barsOnTape(phone)).toBeCloseTo(2.2);
    // Sized by the height alone it would show hardly more than a bar.
    expect((402 - phone.gutterSpaces * 14) / (16 * 14)).toBeLessThan(1.5);
  });

  it('is never smaller than can be read', () => {
    expect(sized(200, 545).space).toBe(6);
  });
});

describe('the bars along the tape', () => {
  const showcase = (): Score => {
    const file = readFileSync('public/demos/showcase.musicxml');
    return new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
  };
  const setOut = (score: Score, width = 1024, height = 300) => {
    const layout = engrave(score);
    const geometry = new StaffGeometry();
    geometry.resize(width, height);
    geometry.setScore(score, undefined, columnsOf(score, layout));
    return { geometry, layout };
  };

  it('are all of one width where nothing is crowded: a piece of quarter notes', () => {
    const score = odeToJoy('Ode to Joy');
    const { geometry } = setOut(score);
    const widths = score.notation.bars.slice(0, -1).map((_, bar) => geometry.barLineX(bar + 1) - geometry.barLineX(bar));
    for (const width of widths) expect(width).toBeCloseTo(geometry.barWidth());
  });

  it('are let out where their notes are crowded: in no bar of the showcase do two moments stand closer than a notehead', () => {
    const score = showcase();
    const { geometry, layout } = setOut(score);
    const head = 1.18 * geometry.space;
    const places = new Map<number, number[]>();
    for (const chord of layout.chords) places.set(chord.bar, [...(places.get(chord.bar) ?? []), geometry.at(chord.beat, chord.bar)]);
    let closest = Infinity;
    for (const xs of places.values()) {
      const moments = [...new Set(xs.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
      for (let i = 1; i < moments.length; i++) closest = Math.min(closest, moments[i] - moments[i - 1]);
    }
    expect(closest).toBeGreaterThanOrEqual(head);
    // And some bar is wider than a bar is by nature: the showcase has runs of thirty-seconds.
    const widest = Math.max(...score.notation.bars.slice(0, -1).map((_, bar) => geometry.barLineX(bar + 1) - geometry.barLineX(bar)));
    expect(widest).toBeGreaterThan(geometry.barWidth() * 1.1);
  });

  it('are found again from a place on them: the bar and the beat under a pointer', () => {
    const score = showcase();
    const { geometry, layout } = setOut(score);
    for (const chord of layout.chords.filter((_, index) => index % 7 === 0)) {
      const found = geometry.pageAt(geometry.at(chord.beat, chord.bar) + 0.01);
      expect(found?.bar).toBe(chord.bar);
      expect(found?.beat).toBeCloseTo(chord.beat, 1);
    }
  });

  it('keep their order when the view is narrower: wider by nature or not, the same notes in the same bars', () => {
    const score = showcase();
    const wide = setOut(score, 1400, 300).geometry;
    const narrow = setOut(score, 400, 500).geometry;
    for (const geometry of [wide, narrow]) {
      const lines = score.notation.bars.map((_, bar) => geometry.barLineX(bar));
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    }
  });
});

