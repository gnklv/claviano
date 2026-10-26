// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, root, settled, staffScores, useApp } from './harness';

/* Free play before a take: the staff it will be written on, and the keyboard with its octaves at hand. */

useApp();

describe('free play, before a take', () => {
  const come = async () => {
    button(/Free play/).click();
    await settled();
  };
  const octave = (label: string) => root.querySelector<HTMLButtonElement>(`.keyboard button[aria-label="${label}"]`)!;
  const lowest = () => Math.min(...[...root.querySelectorAll<HTMLElement>('[data-pitch]')].map((key) => Number(key.dataset.pitch)));

  afterEach(() => vi.unstubAllGlobals());

  it('shows the staff the take will be written on, empty, saying what it is for', async () => {
    await come();
    expect(root.querySelector('.take-staff')).not.toBeNull();
    expect(staffScores.at(-1)!.notes).toEqual([]);
    expect(staffScores.at(-1)!.notation.timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 });
    expect(root.querySelector('.written .on-staff')?.textContent).toBe('Press “Record”: what is played is written here as notes.');
    // (The hint on playing stands over the tiles, and says something else.)
    expect(root.querySelector('.hint')?.textContent).toContain('Play on the keys below.');
  });

  it('moves by octaves from arrows at the keyboard’s ends, out where the range ends; none in the header', async () => {
    await come();
    expect(root.querySelector('.screen-header button[aria-label^="An octave"]')).toBeNull();
    const from = lowest();
    octave('An octave higher').click();
    await settled();
    expect(lowest()).toBe(from + 12);
    octave('An octave lower').click();
    octave('An octave lower').click();
    await settled();
    expect(lowest()).toBe(from - 12);
    for (let i = 0; i < 8 && !octave('An octave lower').disabled; i++) {
      octave('An octave lower').click();
      await settled();
    }
    expect(octave('An octave lower').disabled).toBe(true);
    expect(octave('An octave higher').disabled).toBe(false);
  });

  it('has eight white keys on a phone held upright, a fingertip wide each beside the arrows', async () => {
    // The keys' own width on a phone of 375 px: the two arrows (44 px each) beside them.
    const keysWidth = 375 - 2 * 44;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly told: () => void) {}
        observe(element: Element) {
          Object.defineProperty(element, 'clientWidth', { value: element.classList.contains('keys') ? keysWidth : 0, configurable: true });
          this.told();
        }
        disconnect() {}
      },
    );
    await come();
    const whites = root.querySelectorAll('.key.white').length;
    expect(whites).toBe(8);
    expect(keysWidth / whites).toBeGreaterThanOrEqual(34);
  });
});
