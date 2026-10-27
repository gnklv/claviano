// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { audio, button, named, root, settled, staffScores, turnIntoPhone, useApp } from './harness';

/** A quarter note of the music font (SMuFL), as the tempo is written with. */
const QUARTER_NOTE = '';

/* Free play on a phone held upright: a take has one row of the record bar, the keyboard and the staff the rest. */

useApp();

describe('recording on a phone', () => {
  const bar = () => root.querySelector<HTMLElement>('.record-bar')!;
  const buttons = () => [...bar().querySelectorAll('.take > button, .take .act > button')].map(named);
  const status = () => bar().querySelector('[role=status]')!;
  const press = (code: string, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const beat = () => bar().querySelector('.beat');
  const choose = async (label: string) => {
    button(/^More with the take$/).click();
    await settled();
    [...root.querySelectorAll<HTMLElement>('[role=menuitem]')].find((item) => item.textContent?.trim() === label)!.click();
    await settled();
  };
  /** A take of two bars: a note in each (the metronome's first click is at 0.1; a bar at 80 is three seconds). */
  const recordTwoBars = async () => {
    button(/^Record$/).click();
    audio.time = 0.12;
    press('KeyA');
    audio.time = 0.8;
    press('KeyA', 'keyup');
    audio.time = 3.12;
    press('KeyK');
    audio.time = 3.8;
    press('KeyK', 'keyup');
    await settled();
    button(/^Stop$/).click();
    await settled();
  };

  beforeEach(async () => {
    await turnIntoPhone();
    button(/Free play/).click();
    await settled();
  });

  it('sets the beat before a take, as on a computer', () => {
    expect(buttons()).toEqual(['Record']);
    expect(beat()).not.toBeNull();
    expect(button(/^Metronome$/)).toBeDefined();
    expect(button(/^Faster$/)).toBeDefined();
    expect(button(/^3\/4$/)).toBeDefined();
  });

  it('while waiting for the first note and recording, has "Stop" and what is going on, the beat in words, and no rows for it', async () => {
    button(/^Record$/).click();
    await settled();
    expect(beat()).toBeNull();
    expect(buttons()).toEqual(['Stop']);
    expect(status().textContent).toBe(`Waiting for the first note\u00a0· ${QUARTER_NOTE} = 80 · 4/4`);
    // (The beat stands apart from the words, whole: they give way first where the row is short.)
    expect(status().querySelector('.beat-said')?.textContent).toBe(`\u00a0· ${QUARTER_NOTE} = 80 · 4/4`);

    audio.time = 3.2;
    press('KeyA');
    await settled();
    expect(beat()).toBeNull();
    expect(status().textContent).toMatch(new RegExp(`^Recording · bar \\d+\u00a0· ${QUARTER_NOTE} = 80 · 4/4$`));
  });

  it('once there, has listening, keeping and "⋯" in one row; the count of notes only read out', async () => {
    await recordTwoBars();
    expect(buttons()).toEqual(['Listen', 'Save as a piece', 'More with the take']);
    expect(bar().querySelector('.mend')).toBeNull();
    expect(beat()).toBeNull();
    expect(status().textContent).toBe('Recorded: 2 notes');
    expect(status().classList.contains('unseen')).toBe(true);
    button(/^More with the take$/).click();
    await settled();
    const items = [...root.querySelectorAll('[role=menuitem]')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Erase the last bar', 'Record again', 'Discard']);
    expect(items.at(-1)!.classList.contains('danger')).toBe(true);
  });

  it('erases the last bar from "⋯", and the menu closes', async () => {
    await recordTwoBars();
    await choose('Erase the last bar');
    expect(button(/^More with the take$/).getAttribute('aria-expanded')).toBe('false');
    expect(status().textContent).toBe('Recorded: 1 note');
    expect(staffScores.at(-1)?.bars).toHaveLength(1);
  });

  it('records again from "⋯": waiting for the first note', async () => {
    await recordTwoBars();
    await choose('Record again');
    expect(root.querySelector('[role=menuitem]')).toBeNull();
    expect(buttons()).toEqual(['Stop']);
    expect(status().textContent).toMatch(/^Waiting for the first note/);
  });

  it('discards the take from "⋯": the beat is to be set again', async () => {
    await recordTwoBars();
    await choose('Discard');
    expect(root.querySelector('[role=menuitem]')).toBeNull();
    expect(buttons()).toEqual(['Record']);
    expect(beat()).not.toBeNull();
    expect(staffScores.at(-1)!.notes).toEqual([]);
  });
});

describe('recording on a computer', () => {
  beforeEach(async () => {
    button(/Free play/).click();
    await settled();
  });

  it('keeps the beat in sight through a take, and what is done with one in a row of its own', async () => {
    button(/^Record$/).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    await settled();
    const bar = root.querySelector('.record-bar')!;
    expect(bar.querySelector('.beat')).not.toBeNull();
    expect(bar.querySelector('[role=status]')?.textContent).toMatch(/^Recording · bar \d+$/);
    button(/^Stop$/).click();
    await settled();
    expect([...bar.querySelectorAll('.mend button')].map(named)).toEqual(['Erase the last bar', 'Record again', 'Discard']);
    expect(button(/^More with the take$/)).toBeUndefined();
  });
});
