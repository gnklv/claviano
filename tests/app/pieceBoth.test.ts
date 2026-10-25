// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { rereadPreferences } from '../../src/ui/kept/preferences';
import { button, named, restart, root, settled, turnIntoPhone, useApp } from './harness';

/* The piece's screen in both views: the staff over the falling notes, the height shared by a line drawn up or down. */

useApp();

describe('the staff and the keys together', () => {
  const line = () => root.querySelector<HTMLElement>('.stage [role=separator]');
  const share = () => Number(line()!.getAttribute('aria-valuenow'));
  const press = async (key: string) => {
    line()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await settled();
  };
  const openBoth = async () => {
    button(/Ode to Joy/).click();
    await settled();
    [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => named(choice) === 'Both')!.click();
    await settled();
  };

  beforeEach(openBoth);

  it('shares the height by a line, named, the staff a little under half to begin with', () => {
    expect(line()!.getAttribute('aria-label')).toBe('Between the notes and the keys');
    expect(line()!.getAttribute('aria-orientation')).toBe('horizontal');
    expect(share()).toBe(45);
    expect(root.querySelector<HTMLElement>('.stage')!.style.getPropertyValue('--staff-share')).toBe('45%');
  });

  it('is moved by the arrows, within its bounds, and a double press puts it back', async () => {
    await press('ArrowDown');
    expect(share()).toBe(50);
    for (let i = 0; i < 20; i++) await press('ArrowDown');
    expect(share()).toBe(Number(line()!.getAttribute('aria-valuemax')));
    for (let i = 0; i < 20; i++) await press('ArrowUp');
    expect(share()).toBe(Number(line()!.getAttribute('aria-valuemin')));
    line()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settled();
    expect(share()).toBe(45);
  });

  it('takes the keys when pressed: the arrows move it next', async () => {
    line()!.setPointerCapture = () => {};
    line()!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
    line()!.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1, bubbles: true }));
    expect(document.activeElement).toBe(line());
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settled();
    expect(share()).toBe(50);
  });

  it('is kept between visits, one for every piece', async () => {
    await press('ArrowDown');
    await press('ArrowDown');
    // (Started again at the piece's address: it opens as it was, in both views.)
    rereadPreferences();
    await restart();
    expect(share()).toBe(55);
  });

  it('is not on a phone, which has not the room for both', async () => {
    await turnIntoPhone();
    expect(line()).toBeNull();
  });
});
