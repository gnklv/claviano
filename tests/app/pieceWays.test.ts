// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { rereadPreferences } from '../../src/ui/kept/preferences';
import { button, playback, root, settled, useApp, way } from './harness';

/* The piece's screen, listened to or learnt: the player alone, or the tools of learning too. */

useApp();

describe('listening and learning', () => {
  const choose = (label: 'Listen' | 'Learn') => [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label="Listen or learn"] button')].find((choice) => choice.textContent?.trim() === label)!.click();
  const chosen = () => root.querySelector('.piece header [role=group][aria-label="Listen or learn"] button[aria-pressed=true]')?.textContent?.trim();
  const transport = () => root.querySelector<HTMLElement>('.transport')!;
  const has = (name: RegExp) => [...transport().querySelectorAll('button')].some((each) => name.test(each.textContent?.trim() ?? ''));

  beforeEach(async () => {
    // (Fingering shown, for its button to be offered where it is.)
    localStorage.setItem('claviano.fingerHints', 'on');
    rereadPreferences();
    button(/Ode to Joy/).click();
    await settled();
  });

  it('learns a piece to begin with, with the loop, the hands and the fingers at hand', () => {
    expect(chosen()).toBe('Learn');
    expect(has(/^Loop$/)).toBe(true);
    expect(has(/^Right$/)).toBe(true);
    expect(button(/^Fingers$/)).toBeDefined();
  });

  it('listens to it whole: no loop, no hands, no fingers to set, at its own tempo', async () => {
    playback.setTempo(0.7);
    choose('Listen');
    await settled();
    expect(chosen()).toBe('Listen');
    expect(playback.tempo).toBe(1);
    expect(has(/^Loop$/)).toBe(false);
    expect(has(/^Right$/)).toBe(false);
    expect(button(/^Fingers$/)).toBeUndefined();
    // The trainer is not offered by the tempo either.
    button(/^Tempo: 100%$/).click();
    await settled();
    expect(root.querySelector('[role=group][aria-label="Tempo trainer"]')).toBeNull();
  });

  it('comes back to learning as it was left', async () => {
    playback.setTempo(0.7);
    playback.setHandEnabled('left', false);
    choose('Listen');
    await settled();
    choose('Learn');
    await settled();
    expect(way.way).toBe('learn');
    expect([playback.tempo, playback.isHandEnabled('left')]).toEqual([0.7, false]);
  });
});
