// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { button, onPiece, playback, root, screen, settled, turnIntoPhone, useApp } from './harness';

/*
 * The piece's screen: getting to it and back, the keys of the computer, the view, a phone on its side.
 * (The transport bar is in pieceTransport.test.ts, one's own fingering in pieceFingering.test.ts.)
 */

useApp();

it('opens a demo into the piece screen, under an address of its own, with the piece named in the header', async () => {
  button(/Ode to Joy/).click();
  await settled();
  expect(onPiece()).toBe(true);
  expect(location.hash).toBe('#/piece/demo.ode');
  expect(root.querySelector('.title')?.textContent).toMatch(/^Ode to Joy · 8 bars · \d+ notes$/);
  // Opening files and demos is the library's business: the piece's header has neither.
  expect(root.querySelector('input[type=file]')).toBeNull();
});

it('goes back to the library by the arrow, and the music stops', async () => {
  button(/Ode to Joy/).click();
  await settled();
  await playback.play();
  expect(playback.playing).toBe(true);

  button(/Back to the library/).click();
  await settled();
  expect(onPiece()).toBe(false);
  expect(location.hash).toBe('#/');
  expect(playback.playing).toBe(false);
});

it('goes back to the library by the browser’s Back, and to the piece again by Forward', async () => {
  button(/Ode to Joy/).click();
  await settled();
  location.hash = '#/';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(onPiece()).toBe(false);

  location.hash = '#/piece';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(onPiece()).toBe(true);
});

it('plays and steps by bars from the keyboard on the piece screen only', async () => {
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  press('Space');
  await settled();
  expect(playback.playing).toBe(false);

  button(/Ode to Joy/).click();
  await settled();
  press('ArrowRight');
  expect(playback.position).toBeCloseTo(playback.score!.bars[1]);
  press('Space');
  await settled();
  expect(playback.playing).toBe(true);
});

it('makes the tempo a step slower or faster by − and +, and the piece’s own again by 0', async () => {
  const press = (code: string, more = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...more }));
  button(/Ode to Joy/).click();
  await settled();
  press('Minus');
  press('Minus');
  expect(playback.tempo).toBe(0.9);
  press('Equal');
  expect(playback.tempo).toBe(0.95);
  press('Digit0');
  expect(playback.tempo).toBe(1);
  // Cmd and − is the browser's own: zooming out.
  press('Minus', { metaKey: true });
  expect(playback.tempo).toBe(1);
});

it('goes back to the start by Home, and goes on playing', async () => {
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  button(/Ode to Joy/).click();
  await settled();
  press('ArrowRight');
  press('ArrowRight');
  press('Space');
  await settled();
  press('Home');
  expect(playback.position).toBeCloseTo(0);
  expect(playback.playing).toBe(true);
});

describe('the view', () => {
  const views = () => [...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')];
  const stage = () => root.querySelector('.stage')!;

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
  });

  it('is the staff, the keys or both', async () => {
    expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys', 'Both']);
    views()[2].click();
    await settled();
    expect(stage().classList.contains('view-both')).toBe(true);
  });

  it('is not both on a phone held upright: the keys are shown, and the choice comes back with the room', async () => {
    views()[2].click();
    await settled();
    await turnIntoPhone();
    expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys']);
    expect(stage().classList.contains('view-keys')).toBe(true);

    screen.phone = false;
    screen.listeners.forEach((listener) => listener());
    await nextTick();
    expect(stage().classList.contains('view-both')).toBe(true);
    views()[1].click();
    await settled();
  });
});

describe('a phone on its side', () => {
  const immersed = () => root.querySelector('.piece')!.classList.contains('immersed');
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const touch = (selector: string) => root.querySelector(selector)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
    screen.short = true;
    screen.listeners.forEach((listener) => listener());
    await nextTick();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => vi.useRealTimers());

  it('keeps what is set once a session behind "⋯", and offers the staff or the keys, not both', () => {
    const bar = root.querySelector('.transport')!;
    expect([...bar.querySelectorAll('button[aria-pressed]')].filter((element) => !element.closest('dialog'))).toHaveLength(1);
    expect(button(/^Practice$/)).toBeDefined();
    expect([...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')]).toHaveLength(2);
  });

  it('gives the screen to the music while it plays: the header and the transport go three seconds after the last touch', async () => {
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);

    press('Space');
    await vi.advanceTimersByTimeAsync(2900);
    expect(immersed()).toBe(false);
    touch('.transport');
    await vi.advanceTimersByTimeAsync(2900);
    expect(immersed()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(immersed()).toBe(true);
    expect(root.querySelector('.waker')).not.toBeNull();
  });

  it('brings them back at a touch, and for good when the music stops', async () => {
    press('Space');
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);

    touch('.waker');
    await vi.advanceTimersByTimeAsync(0);
    expect(immersed()).toBe(false);
    expect(root.querySelector('.waker')).toBeNull();
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);

    press('Space');
    await vi.advanceTimersByTimeAsync(0);
    expect(immersed()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);
  });

  describe('the staff, while they are away', () => {
    let stageHeight: number;
    /** Plays until they go, on the staff alone, 200 px tall beside them in a stage as tall. */
    const immerse = async () => {
      [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => choice.textContent?.trim() === 'Notes')!.click();
      await nextTick();
      stageHeight = 200;
      Object.defineProperty(root.querySelector('.stage')!, 'clientHeight', { get: () => stageHeight, configurable: true });
      Object.defineProperty(root.querySelector('.staff')!, 'clientHeight', { get: () => 200, configurable: true });
      press('Space');
      await vi.advanceTimersByTimeAsync(3100);
      expect(immersed()).toBe(true);
      stageHeight = 300;
      return root.querySelector<HTMLElement>('.staff')!;
    };

    it('keeps as tall as it was beside them, until they are back in place', async () => {
      const staff = await immerse();
      expect(staff.style.height).toBe('200px');
      touch('.waker');
      await vi.advanceTimersByTimeAsync(0);
      // (On their way back: the stage is still taller.)
      expect(staff.style.height).toBe('200px');
      stageHeight = 200;
      root.querySelector('.strip')!.dispatchEvent(new Event('transitionend'));
      await vi.advanceTimersByTimeAsync(0);
      expect(staff.style.height).toBe('');
    });

    it('is let go at once when they come back before they have gone', async () => {
      const staff = await immerse();
      stageHeight = 200;
      touch('.waker');
      await vi.advanceTimersByTimeAsync(0);
      expect(staff.style.height).toBe('');
    });
  });

  it('does not take them from under an open panel', async () => {
    press('Space');
    await vi.advanceTimersByTimeAsync(0);
    button(/^Settings$/).click();
    await vi.advanceTimersByTimeAsync(4000);
    expect(immersed()).toBe(false);
    button(/^Close$/).click();
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);
  });

  it('is not so on a screen of full height', async () => {
    screen.short = false;
    screen.listeners.forEach((listener) => listener());
    press('Space');
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);
  });
});
