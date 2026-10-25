// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nudgeWithinScreen } from '../src/ui/browser/withinScreen';

/* A pop-up moved along its button's row to stand inside the screen. */

describe('standing inside the screen', () => {
  const screenOf = (width: number) => Object.defineProperty(document.documentElement, 'clientWidth', { get: () => width, configurable: true });
  afterEach(() => screenOf(0));

  it('stays where it is when it fits', () => {
    screenOf(600);
    expect(nudgeWithinScreen(100, 300, 16)).toBe(0);
  });

  it('comes in from the right edge, and from the left one, to stand clear of it', () => {
    screenOf(600);
    expect(nudgeWithinScreen(400, 300, 16)).toBe(-116);
    expect(nudgeWithinScreen(-40, 300, 16)).toBe(56);
  });

  it('stands against the left edge when it is wider than the room', () => {
    screenOf(300);
    expect(nudgeWithinScreen(100, 340, 16)).toBe(-84);
  });
});
