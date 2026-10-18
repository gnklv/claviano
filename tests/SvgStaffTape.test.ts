// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawStaff } from './drawnStaff';
import { ode, showcase } from './staffPieces';

/* The staff's tape: stretched while its size is on the move, shown near the view only, dragged by hand. */

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
  /** The tape: its last drawn thing, which is another one when the tape is drawn anew. */
  const tape = (container: HTMLElement) => container.children[1].querySelector('svg > g')!;
  const notes = (container: HTMLElement) => tape(container).children.length;
  const firstNote = (container: HTMLElement) => tape(container).lastElementChild;

  it('is stretched at once to a size told by itself, where drawing anew takes longer than a frame, and drawn anew when it has come to rest', () => {
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    const before = firstNote(container);
    size.height = 200;
    staff.resize();
    expect(firstNote(container)).toBe(before);
    expect(transformOf(container)).toMatch(/^translate\(0px, [\d.-]+px\) scale\(0\.\d+\)$/);
    // Smaller, the tape is boxed as it will be: it reaches the view's edges, faded there and cut.
    const box = (container.children[1] as HTMLElement).style;
    expect(parseFloat(box.right)).toBeLessThan(0);
    expect(parseFloat(box.bottom)).toBeLessThan(0);
    vi.advanceTimersByTime(200);
    expect(firstNote(container)).not.toBe(before);
    expect(transformOf(container)).toBe('');
    expect([box.right, box.bottom]).toEqual(['0px', '0px']);
  });

  it('is stretched through sizes told one after another, where drawing anew takes longer than a frame, and drawn anew when they stop', () => {
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    time += 1000;
    size.height = 290;
    staff.resize();
    const drawn = firstNote(container);

    // A window dragged by its edge: a new size at every frame.
    for (const height of [270, 240, 210, 200]) {
      size.height = height;
      staff.resize();
      expect(firstNote(container)).toBe(drawn);
    }
    // Smaller, as the staff would be at that height, and in the middle of it.
    expect(transformOf(container)).toMatch(/^translate\(0px, [\d.-]+px\) scale\(0\.\d+\)$/);

    vi.advanceTimersByTime(200);
    expect(transformOf(container)).toBe('');
    expect(firstNote(container)).not.toBe(drawn);
    expect(notes(container)).toBeGreaterThan(0);
  });

  it('is drawn anew at every size where that is quick', () => {
    step = 1;
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    for (const height of [290, 270, 240]) {
      const before = firstNote(container);
      size.height = height;
      staff.resize();
      expect(firstNote(container)).not.toBe(before);
      expect(transformOf(container)).toBe('');
    }
  });
});


describe('a piece many screens long', () => {
  afterEach(() => vi.restoreAllMocks());

  const signs = (container: HTMLElement) =>
    [...container.children[1].querySelectorAll('text')]
      .map((text) => ({ x: Number(text.getAttribute('x')), shown: !text.closest('[style*="display: none"]') }))
      .sort((a, b) => a.x - b.x);

  it('shows the tape near the view only, and more of it as the music moves on', () => {
    const score = showcase();
    const { staff, container } = drawStaff(score, { width: 800, height: 300 });
    /** The signs within the first 400 pixels of the view. */
    const inView = () => {
      const left = -Number(/translateX\(([-\d.]+)/.exec(container.children[1].querySelector('svg')!.style.transform)![1]);
      return signs(container).filter((sign) => sign.x >= left && sign.x < left + 400);
    };
    expect(inView().length).toBeGreaterThan(0);
    expect(inView().every((sign) => sign.shown)).toBe(true);
    expect(signs(container).at(-1)!.shown).toBe(false);

    // Halfway through. (A leap so far is glided over: a second of frames, on a clock set by hand.)
    let time = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 100));
    for (let frame = 0; frame < 10; frame++) staff.render(score.duration / 2);
    expect(inView().length).toBeGreaterThan(0);
    expect(inView().every((sign) => sign.shown)).toBe(true);
    expect(signs(container).filter((sign) => sign.x < 400).some((sign) => sign.shown)).toBe(false);
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
  const offset = (container: HTMLElement) => Number(/translateX\(([-\d.]+)px\)/.exec(container.children[1].querySelector('svg')!.style.transform)![1]);
  /** Where the tape stands for the music at `position`, on a staff nobody has touched. */
  const following = (position: number) => {
    const { staff, container } = drawStaff(ode());
    for (let i = 0; i < 20; i++) frame(staff, position);
    return offset(container);
  };

  it('stays where it was put while the music plays on, and goes back to it after a while', () => {
    const { staff, container } = drawStaff(ode());
    frame(staff, 1);
    staff.dragBy(-150);
    let position = 1;
    frame(staff, position);
    const put = offset(container);
    for (; position < 3.5; position += 0.1) frame(staff, position);
    expect(offset(container)).toBe(put);
    for (; position < 5.5; position += 0.1) frame(staff, position);
    expect(offset(container)).toBeCloseTo(following(position - 0.1), 0);
  });

  it('goes back at once when the music is sent elsewhere', () => {
    const { staff, container } = drawStaff(ode());
    frame(staff, 1);
    staff.dragBy(-150);
    frame(staff, 1.1);
    for (let i = 0; i < 20; i++) frame(staff, 8);
    expect(offset(container)).toBeCloseTo(following(8), 0);
  });
});
