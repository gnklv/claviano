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
    // (The piece open this visit, opened again: set as it was left, as on another visit.)
    goOn()!.click();
    await settled();
    expect(root.querySelector('.piece .title')?.textContent).toBe('First');
    expect(playback.position).toBeCloseTo(0.2);
  });

  it('says where the piece was left whole, on a second line if it must; the other tiles\' short words are cut short', async () => {
    await drop('first.musicxml', xml('First'));
    playback.seek(0.2);
    await back();
    // (The test DOM lays nothing out: the wrapping is asked for by name, and seen in the browser.)
    const wrapped = actions().map((tile) => tile.querySelector('.note')!.classList.contains('wrap'));
    expect(wrapped).toEqual([true, false, false]);
  });

  it('opens the piece where it was left from its card too, this visit and the next', async () => {
    await drop('first.musicxml', xml('First'));
    playback.seek(0.2);
    await back();
    button(/^First/).click();
    await settled();
    expect(playback.position).toBeCloseTo(0.2);
    await back();
    // (Opened again and left: its place is still its own, not the beginning.)
    expect(button(/^First/).querySelector('.note')?.textContent).toBe('bar 1 of 1 · today');
    await restart();
    goOn()!.click();
    await settled();
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
