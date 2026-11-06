// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { rereadPreferences } from '../../src/ui/kept/preferences';
import { button, fingering, learn, playback, rollFrames, rollPointer, root, settled, useApp } from './harness';

useApp();

describe('the notes shown for the current performance', () => {
  it('uses the same event indices for plain tiles, their fingers and picking, then restores the original performance', async () => {
    button(/Ode to Joy/).click();
    await settled();
    await learn();
    const original = playback.score!;
    const later = original.notes.find((note) => note.hand === 'right' && note.beat > 0)!;
    fingering.setFinger({ beat: later.beat, pitch: later.pitch, hand: later.hand }, 3);
    playback.setPracticeNotes([later], null);
    const variant = playback.performanceScore!;
    playback.setTempo(0.8);
    localStorage.setItem('claviano.fingerHints', 'on');
    rereadPreferences();
    await settled();
    const frame = rollFrames.at(-1)!;
    expect(frame.score.notes).toBe(variant.notes);
    expect(frame.fingers).toHaveLength(1);
    expect(frame.fingers![0]?.text).toBe('3');
    button(/^Fingers$/).click();
    await settled();
    rollPointer.note = 0;
    const roll = root.querySelector('canvas')!;
    roll.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    roll.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    await settled();
    expect(rollFrames.at(-1)!.picked).toEqual([0]);
    button(/^5$/).click();
    await settled();
    expect(fingering.all).toEqual([{ beat: later.beat, pitch: later.pitch, finger: 5 }]);
    expect(playback.score).toBe(original);
    playback.setPracticeNotes(null, null);
    playback.setTempo(0.9);
    await settled();
    expect(rollFrames.at(-1)!.score.notes).toBe(original.notes);
  });
});
