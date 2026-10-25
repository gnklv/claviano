// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { rereadPreferences } from '../../src/ui/kept/preferences';
import { button, fingering, learn, named, playback, rollFrames, rollPointer, root, settled, staffPointer, staffScores, useApp } from './harness';

/* The piece's screen: one's own fingering, set on the staff or on the falling notes. */

useApp();

describe('one’s own fingering', () => {
  const press = () => {
    const staff = root.querySelector('.staff')!;
    staff.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    staff.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
  };
  const bar = () => root.querySelector('.finger-bar');
  const view = () => {
    const chosen = [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => choice.getAttribute('aria-pressed') === 'true');
    return chosen && named(chosen);
  };
  /** Fingering shown, as chosen in the settings. */
  const showFingering = async () => {
    localStorage.setItem('claviano.fingerHints', 'on');
    rereadPreferences();
    await settled();
  };

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
    await learn();
  });

  it('is offered only where fingering is shown', async () => {
    expect(button(/^Fingers$/)).toBeUndefined();
    await showFingering();
    expect(button(/^Fingers$/)).toBeDefined();
  });

  it('is set on the falling notes too, with the keys alone in sight: a press on a tile picks its note, ringed on every pass', async () => {
    await showFingering();
    expect(view()).toBe('Keys');
    button(/^Fingers$/).click();
    await settled();
    expect(view()).toBe('Keys');

    const index = playback.score!.notes.findIndex((note) => note.hand === 'right' && note.beat > 0);
    const note = playback.score!.notes[index];
    rollPointer.note = index;
    playback.seek(3);
    const roll = root.querySelector('canvas')!;
    roll.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    roll.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    await settled();
    // (Picked: the music has not moved.)
    expect(playback.position).toBe(3);
    expect(bar()!.textContent).toContain('Right');
    expect(rollFrames.at(-1)?.picked).toContain(index);

    button(/^2$/).click();
    await settled();
    expect(fingering.all).toEqual([{ beat: note.beat, pitch: note.pitch, finger: 2 }]);
  });

  it('is set a note at a time: a press picks the note, and a finger is set for it', async () => {
    const first = playback.score!.notation.notes[0];
    await showFingering();
    root.querySelector<HTMLElement>('.piece header [role=group][aria-label=View] button:last-child')!.click();
    await settled();
    button(/^Fingers$/).click();
    await settled();
    expect(root.querySelector('.transport')).toBeNull();
    expect(bar()!.textContent).toContain('Press a note');

    staffPointer.note = { beat: first.beat, pitch: first.sounding, hand: first.hand };
    playback.seek(3);
    press();
    await settled();
    // (Picked: the music has not moved.)
    expect(playback.position).toBe(3);
    expect(staffPointer.picked).toEqual(staffPointer.note);

    button(/^3$/).click();
    await settled();
    expect(fingering.all).toEqual([{ beat: first.beat, pitch: first.sounding, finger: 3 }]);
    // (The note stays picked: the next is picked by hand.)
    expect(staffPointer.picked).toEqual(staffPointer.note);

    button(/^Done$/).click();
    await settled();
    expect(bar()).toBeNull();
    expect(root.querySelector('.transport')).not.toBeNull();
  });

  it('is shown with the hints on the staff and on the falling notes, and not at all where fingering is not shown', async () => {
    root.querySelector<HTMLElement>('.piece header [role=group][aria-label=View] button:last-child')!.click();
    await settled();
    const first = playback.score!.notation.notes[0];
    fingering.setFinger({ beat: first.beat, pitch: first.sounding, hand: first.hand }, 3);
    await settled();
    const own = () => staffScores.at(-1)!.notation.notes.some((note) => note.fingering?.own);
    expect(own()).toBe(false);
    expect(rollFrames.at(-1)?.fingers?.some((finger) => finger !== null) ?? false).toBe(false);

    await showFingering();
    expect(own()).toBe(true);
    expect(staffScores.at(-1)!.notation.notes.some((note) => note.fingering?.hint)).toBe(true);
    expect(rollFrames.at(-1)?.fingers?.some((finger) => finger !== null)).toBe(true);
  });
});
