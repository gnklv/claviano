// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { button, playback, root, settled, staffScores, useApp, volume } from './harness';

/* The settings panel, on either screen. */

useApp();

describe('the settings panel', () => {
  const panel = () => root.querySelector<HTMLDialogElement>('dialog')!;
  const labels = () => [...panel().querySelectorAll('.label')].map((label) => label.textContent);

  it('opens from the gear on either screen, and closes by its cross', async () => {
    expect(panel().open).toBe(false);
    button(/^Settings$/).click();
    await settled();
    expect(panel().open).toBe(true);
    button(/^Close$/).click();
    await settled();
    expect(panel().open).toBe(false);
  });

  it('slides away before it closes, where there is motion: by the cross, by Esc, by a click beside it', async () => {
    // (As the styles would have it in a browser: the sheet takes 0.3 s to leave.)
    const sheet = panel().querySelector<HTMLElement>('.sheet')!;
    sheet.style.transitionDuration = '0.3s';
    const closings: (() => void)[] = [
      () => button(/^Close$/).click(),
      () => panel().dispatchEvent(new Event('cancel', { cancelable: true })),
      () => panel().click(),
    ];
    for (const close of closings) {
      button(/^Settings$/).click();
      await settled();
      close();
      await settled();
      expect(panel().open).toBe(true);
      expect(panel().classList.contains('closing')).toBe(true);
      sheet.dispatchEvent(new Event('transitionend'));
      await settled();
      expect(panel().open).toBe(false);
      expect(panel().classList.contains('closing')).toBe(false);
    }
  });

  it('has in the library what goes for any piece: the sound, how loud it is, the theme, the language', () => {
    expect(labels()).toEqual(['Sound', 'Notes volume', 'Metronome volume', 'Theme', 'Language']);
  });

  it('has on the piece screen the view as well', async () => {
    button(/Ode to Joy/).click();
    await settled();
    expect(labels()).toEqual(['View', 'Fingering hints', 'Sound', 'Notes volume', 'Metronome volume', 'Theme', 'Language']);
  });


  it('offers fingering hints on the piece screen: off unless asked for; the staff is given the piece with them written in', async () => {
    button(/Ode to Joy/).click();
    await settled();
    // (The staff is what shows them.)
    [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((option) => option.textContent?.trim() === 'Notes')!.click();
    await settled();
    const hints = () => root.querySelector('[role=group][aria-label="Fingering hints"]')!;
    const chosen = () => hints().querySelector('[aria-pressed=true]')?.textContent?.trim();
    /** The fingers the staff has been given to print, as hints. */
    const hinted = () => staffScores.at(-1)!.notation.notes.filter((note) => note.fingering?.hint).length;
    expect(chosen()).toBe('Off');
    expect(hinted()).toBe(0);

    [...hints().querySelectorAll('button')].find((option) => option.textContent?.trim() === 'On')!.click();
    await settled();
    expect(chosen()).toBe('On');
    expect(hinted()).toBeGreaterThan(0);
    // The piece that is played is the same: only what is printed has changed.
    expect(staffScores.at(-1)!.notes).toBe(playback.score!.notes);
    [...hints().querySelectorAll('button')].find((option) => option.textContent?.trim() === 'Off')!.click();
    await settled();
    expect(hinted()).toBe(0);
    expect(staffScores.at(-1)).toBe(playback.score);
  });

  it('turns the notes down from its slider', async () => {
    const slider = panel().querySelector<HTMLInputElement>('input[type=range]')!;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await settled();
    expect(volume.of('instrument')).toBe(0.4);
    expect(panel().querySelector('output')?.textContent).toBe('40%');
  });
});
