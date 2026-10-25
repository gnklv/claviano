// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { button, drop, playback, restart, root, settled, useApp, xml } from './harness';

/* The library: going on with the piece played last, where it was left. */

useApp();

describe('going on', () => {
  const actions = () => [...root.querySelectorAll<HTMLElement>('.actions .action-tile')];
  const goOn = () => actions().find((tile) => tile.querySelector('.name')?.textContent === 'Continue');
  const main = () => actions().find((tile) => tile.classList.contains('main'))?.querySelector('.name')?.textContent;
  const back = async () => {
    button(/Back to the library/).click();
    await settled();
  };

  it('is offered for the piece played last, once begun, with its place; and opens it there', async () => {
    await drop('first.musicxml', xml('First'));
    // (Not near its end: a piece left at its very end begins again.)
    playback.seek(0.2);
    await back();
    expect(goOn()?.querySelector('.note')?.textContent).toBe('First · bar 1 of 1');
    expect(main()).toBe('Continue');
    // (On another visit: the piece open this visit is not set as it was left when opened again, as from its card.)
    await restart();
    goOn()!.click();
    await settled();
    expect(root.querySelector('.piece .title')?.textContent).toBe('First');
    expect(playback.position).toBeCloseTo(0.2);
  });

  it('is not offered for a piece not begun, nor with no pieces: opening a file is the main thing then', async () => {
    expect(goOn()).toBeUndefined();
    expect(main()).toBe('Open file');
    await drop('first.musicxml', xml('First'));
    await back();
    expect(goOn()).toBeUndefined();
    expect(main()).toBe('Open file');
  });

  it('goes with the piece played last: another opened and not begun, it is not offered', async () => {
    await drop('first.musicxml', xml('First'));
    playback.seek(0.5);
    await back();
    expect(goOn()).toBeDefined();
    await drop('second.musicxml', xml('Second'));
    await back();
    expect(goOn()).toBeUndefined();
    expect(main()).toBe('Open file');
  });
});
