// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, named, playback, root, settled, staffLines, turnIntoPhone, useApp } from './harness';

/* The staff alone on a phone held upright: lines one under another, as on a page, as many as fit. */

useApp();

describe('the staff in lines', () => {
  /** The stage's size, as the staff finds it. */
  const size = { width: 375, height: 636 };
  const lines = () => [...root.querySelectorAll<HTMLElement>('.staff-line')];
  const notes = async () => {
    [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => named(choice) === 'Notes')!.click();
    await settled();
  };

  beforeEach(async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly told: () => void) {}
        observe(element: Element) {
          if (element.classList.contains('staff')) {
            Object.defineProperty(element, 'clientWidth', { get: () => size.width, configurable: true });
            Object.defineProperty(element, 'clientHeight', { get: () => size.height, configurable: true });
          }
          this.told();
        }
        disconnect() {}
      },
    );
    // A line asks for a third of the stage and a little over (the Ode, at 375 px: see StaffView's slack).
    staffLines.height = 212.3;
    button(/Ode to Joy/).click();
    await settled();
    await notes();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('stands in as many lines as fit whole on a phone held upright, each going on from the one over it', async () => {
    expect(lines()).toHaveLength(1);
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
    await turnIntoPhone();
    await settled();
    expect(lines()).toHaveLength(3);
  });

  it('is one line where two do not fit', async () => {
    staffLines.height = 400;
    await turnIntoPhone();
    await settled();
    expect(lines()).toHaveLength(1);
  });

  it('is one line beside the falling notes, and on a wide screen', async () => {
    expect(lines()).toHaveLength(1);
    [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => named(choice) === 'Both')!.click();
    await settled();
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
