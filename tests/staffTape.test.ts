// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawStaff } from './drawnStaff';
import { timeDigits } from '../src/infrastructure/render/staff/glyphs';
import { ode } from './staffPieces';

/* The staff's tape: stretched while its size is on the move, dragged by hand. (Shown near the view only: see the pictures of canvasStaff.test.ts.) */

describe('a staff whose size is on the move', () => {
  /** A clock on which every look takes `step` ms: drawing the piece anew is seen to take that long. */
  let step: number;
  let time: number;
  beforeEach(() => {
    time = 0;
    step = 20;
    // (Only the timers are set by hand: the clock is this test's own.)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(performance, 'now').mockImplementation(() => (time += step));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const transformOf = (container: HTMLElement) => (container.lastElementChild as HTMLElement).style.transform;

  it('is stretched at once to a size told by itself, where drawing anew takes longer than a frame, and drawn anew when it has come to rest', () => {
    const size = { width: 800, height: 300 };
    const { staff, shown, container } = drawStaff(ode(), size);
    const before = shown.tape;
    size.height = 200;
    staff.resize();
    expect(shown.tape).toBe(before);
    expect(transformOf(container)).toMatch(/^translate\(0px, [\d.-]+px\) scale\(0\.\d+\)$/);
    // Smaller, the tape is boxed as it will be: it reaches the view's edges, faded there and cut.
    const box = (container.children[1] as HTMLElement).style;
    expect(parseFloat(box.right)).toBeLessThan(0);
    expect(parseFloat(box.bottom)).toBeLessThan(0);
    vi.advanceTimersByTime(200);
    expect(shown.tape).not.toBe(before);
    expect(transformOf(container)).toBe('');
    expect([box.right, box.bottom]).toEqual(['0px', '0px']);
  });

  it('is stretched through sizes told one after another, where drawing anew takes longer than a frame, and drawn anew when they stop', () => {
    const size = { width: 800, height: 300 };
    const { staff, shown, container } = drawStaff(ode(), size);
    time += 1000;
    size.height = 290;
    staff.resize();
    const drawn = shown.tape;

    // A window dragged by its edge: a new size at every frame.
    for (const height of [270, 240, 210, 200]) {
      size.height = height;
      staff.resize();
      expect(shown.tape).toBe(drawn);
    }
    // Smaller, as the staff would be at that height, and in the middle of it.
    expect(transformOf(container)).toMatch(/^translate\(0px, [\d.-]+px\) scale\(0\.\d+\)$/);

    vi.advanceTimersByTime(200);
    expect(transformOf(container)).toBe('');
    expect(shown.tape).not.toBe(drawn);
    expect(shown.tape?.chords.length).toBeGreaterThan(0);
  });

  it('is drawn anew at every size where that is quick', () => {
    step = 1;
    const size = { width: 800, height: 300 };
    const { staff, shown, container } = drawStaff(ode(), size);
    for (const height of [290, 270, 240]) {
      const before = shown.tape;
      size.height = height;
      staff.resize();
      expect(shown.tape).not.toBe(before);
      expect(transformOf(container)).toBe('');
    }
  });
});


describe('the tape dragged by hand', () => {
  /** A frame a tenth of a second after the last, on a clock set by hand. */
  let time: number;
  beforeEach(() => {
    time = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => time);
  });
  afterEach(() => vi.restoreAllMocks());
  const frame = (staff: ReturnType<typeof drawStaff>['staff'], position: number) => {
    time += 100;
    staff.render(position, undefined, true);
  };
  const offset = (shown: ReturnType<typeof drawStaff>['shown']) => shown.offset;
  /** Where the tape stands for the music at `position`, on a staff nobody has touched. */
  const following = (position: number) => {
    const { staff, shown } = drawStaff(ode());
    for (let i = 0; i < 20; i++) frame(staff, position);
    return offset(shown);
  };

  it('stays where it was put while the music plays on, and goes back to it after a while', () => {
    const { staff, shown } = drawStaff(ode());
    frame(staff, 1);
    staff.dragBy(-150);
    let position = 1;
    frame(staff, position);
    const put = offset(shown);
    for (; position < 3.5; position += 0.1) frame(staff, position);
    expect(offset(shown)).toBe(put);
    for (; position < 5.5; position += 0.1) frame(staff, position);
    expect(offset(shown)).toBeCloseTo(following(position - 0.1), 0);
  });

  it('goes back at once when the music is sent elsewhere', () => {
    const { staff, shown } = drawStaff(ode());
    frame(staff, 1);
    staff.dragBy(-150);
    frame(staff, 1.1);
    for (let i = 0; i < 20; i++) frame(staff, 8);
    expect(offset(shown)).toBeCloseTo(following(8), 0);
  });
});

describe('the staff as lines of a page', () => {
  const PHONE = { width: 375, height: 212 };
  afterEach(() => vi.restoreAllMocks());

  it('goes on in a line under another where that one ends: a whole tape further on', () => {
    // (Frames a tenth of a second apart, on a clock set by hand: each line glides to the music, and arrives.)
    let time = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 100));
    const first = drawStaff(ode(), PHONE);
    const second = drawStaff(ode(), PHONE);
    first.staff.setLine(0, 1);
    second.staff.setLine(1, 0);
    for (let i = 0; i < 20; i++) {
      first.staff.render(3);
      second.staff.render(3);
    }
    const tape = PHONE.width - first.staff['geometry'].gutterWidth();
    expect(second.shown.offset).toBeCloseTo(first.shown.offset - tape, 0);
  });

  it('asks for the height in which its width, not the height, sizes it', () => {
    const { staff } = drawStaff(ode(), PHONE);
    const height = staff.heightAt(PHONE.width);
    const space = (size: { width: number; height: number }) => drawStaff(ode(), size).staff['geometry'].space;
    expect(space({ width: PHONE.width, height })).toBeCloseTo(space({ width: PHONE.width, height: 2000 }));
    expect(space({ width: PHONE.width, height: height - 20 })).toBeLessThan(space({ width: PHONE.width, height }));
  });

  it('prints the time signature on the first line only, the clefs and the key on every line', () => {
    const first = drawStaff(ode(), PHONE);
    const second = drawStaff(ode(), PHONE);
    first.staff.setLine(0, 1);
    second.staff.setLine(1, 0);
    first.staff.render(0);
    second.staff.render(0);
    const column = (shown: typeof first.shown) => shown.column.flatMap((shape) => (shape.kind === 'text' ? [shape.text] : []));
    const four = timeDigits(4);
    expect(column(first.shown).filter((text) => text === four)).toHaveLength(4);
    expect(column(second.shown)).not.toContain(four);
    // (Its clefs still: as many glyphs, but for the four digits.)
    expect(column(second.shown)).toHaveLength(column(first.shown).length - 4);
  });

  it('goes on in a third line where the second ends, the second wider by the time signature it does not print', () => {
    let time = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 100));
    const lines = [0, 1, 2].map((over) => {
      const line = drawStaff(ode(), PHONE);
      line.staff.setLine(over, 2 - over);
      return line;
    });
    for (let i = 0; i < 20; i++) for (const line of lines) line.staff.render(3);
    const tape = (line: (typeof lines)[number]) => PHONE.width - line.staff['geometry'].gutterWidth();
    expect(tape(lines[1])).toBeGreaterThan(tape(lines[0]));
    expect(lines[1].shown.offset).toBeCloseTo(lines[0].shown.offset - tape(lines[0]), 0);
    expect(lines[2].shown.offset).toBeCloseTo(lines[1].shown.offset - tape(lines[1]), 0);
  });
});
