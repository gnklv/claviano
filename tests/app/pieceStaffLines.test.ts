// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, learn, named, playback, root, settled, staffLines, turnIntoPhone, useApp } from './harness';

/* The staff alone, on any screen: lines one under another, as on a page, as many as fit. */

useApp();

describe('the staff in lines', () => {
  /** The staff's size, as it finds it: a phone held upright's stage, unless a test says another. */
  const size = { width: 375, height: 636 };
  /** Told of a new size: the staff's watchers. */
  let told: (() => void)[] = [];
  const resized = async (width: number, height: number) => {
    Object.assign(size, { width, height });
    for (const tell of told) tell();
    await settled();
  };
  const lines = () => [...root.querySelectorAll<HTMLElement>('.staff-line')];
  const view = async (name: string) => {
    [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => named(choice) === name)!.click();
    await settled();
  };

  beforeEach(async () => {
    told = [];
    Object.assign(size, { width: 375, height: 636 });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly tell: () => void) {}
        observe(element: Element) {
          if (element.classList.contains('staff')) {
            Object.defineProperty(element, 'clientWidth', { get: () => size.width, configurable: true });
            Object.defineProperty(element, 'clientHeight', { get: () => size.height, configurable: true });
            told.push(this.tell);
          }
          this.tell();
        }
        disconnect() {}
      },
    );
    // A line asks for a third of the stage and a little over (the Ode, at 375 px).
    staffLines.height = 212.3;
    button(/Ode to Joy/).click();
    await settled();
    await view('Notes');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('stands in as many lines as fit whole on a phone held upright, each going on from the one over it', async () => {
    await turnIntoPhone();
    await settled();
    expect(lines()).toHaveLength(3);
    // (Each told how many lines stand over it and under it: the second shows where the first ends.)
    expect(staffLines.lines).toEqual([
      { over: 0, under: 2 },
      { over: 1, under: 1 },
      { over: 2, under: 0 },
    ]);
  });

  it('has three lines at the most', async () => {
    staffLines.height = 100;
    await resized(375, 636);
    expect(lines()).toHaveLength(3);
  });

  it('is one line where two do not fit, even a little smaller', async () => {
    staffLines.height = 400;
    await resized(375, 636);
    expect(lines()).toHaveLength(1);
  });

  it('stands in two lines on a computer, listened to and learnt alike: a little smaller rather than one', async () => {
    // (1280 × 800: the Ode's line asks for 336 px; the stage is 656 px high listened to, about 605 learnt, under the plan's bar.)
    staffLines.height = 336;
    await resized(1280, 656);
    expect(lines()).toHaveLength(2);
    await learn();
    await resized(1280, 605);
    expect(lines()).toHaveLength(2);
  });

  it('is one line beside the falling notes', async () => {
    await resized(1280, 656);
    await view('Both');
    expect(lines()).toHaveLength(1);
  });

  it('takes the music to the bar pressed on the second line', async () => {
    await turnIntoPhone();
    await settled();
    lines().forEach((line, i) => (line.getBoundingClientRect = () => ({ top: i * 212, bottom: (i + 1) * 212, left: 0, right: 375 }) as DOMRect));
    const staff = root.querySelector('.staff')!;
    staff.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 300 }));
    staff.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 300 }));
    await settled();
    // (The stand-in puts a press on a line on the bar of its number: the second line, the second bar.)
    expect(playback.position).toBeCloseTo(playback.score!.bars[1]);
  });
});
