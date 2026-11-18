// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawStaff } from './drawnStaff';
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

describe('the cursor', () => {
  const cursor = (container: HTMLElement) => container.lastElementChild as HTMLElement;

  it('marks the music; on a staff with none yet (a take before its first note) there is none', () => {
    const empty = drawStaff({ ...ode(), notes: [] });
    empty.staff.render(0);
    expect(cursor(empty.container).style.visibility).toBe('hidden');
    const music = drawStaff(ode());
    music.staff.render(0);
    expect(cursor(music.container).style.visibility).toBe('visible');
  });
});
