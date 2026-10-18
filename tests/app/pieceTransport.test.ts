// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarks, button, playback, root, settled, turnIntoPhone, useApp } from './harness';

/* The piece's screen: the transport bar, with the bookmarks and the tempo. */

useApp();

describe('the transport bar', () => {
  const bar = () => root.querySelector<HTMLElement>('.transport')!;
  const chip = (label: RegExp) => [...bar().querySelectorAll<HTMLElement>('button')].find((element) => label.test(element.textContent ?? ''))!;

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
  });

  it('has what is set once a session beside what is always at hand: the hands, the metronome, the count-in, the pedal', () => {
    const pressable = [...bar().querySelectorAll('button[aria-pressed]')].map((element) => element.textContent?.trim());
    expect(pressable).toEqual(['Loop', 'Right', 'Left', 'Metronome', 'Count-in', 'Pedal']);
  });

  it('turns the count-in and the pedal on and off', async () => {
    for (const [label, read] of [[/Count-in/, () => playback.countInEnabled], [/Pedal/, () => playback.pedalEnabled]] as const) {
      const before = read();
      chip(label).click();
      await settled();
      expect(read()).toBe(!before);
      expect(chip(label).getAttribute('aria-pressed')).toBe(String(!before));
    }
  });

  it('keeps on a phone what is set once a session in a sheet behind "⋯"', async () => {
    await turnIntoPhone();
    const sheet = () => bar().querySelector<HTMLDialogElement>('dialog[aria-label=Practice]')!;
    const inBar = [...bar().querySelectorAll('button[aria-pressed]')].filter((element) => !element.closest('dialog'));
    expect(inBar.map((element) => element.textContent?.trim())).toEqual(['Loop']);
    expect(sheet().open).toBe(false);

    button(/^Practice$/).click();
    await settled();
    expect(sheet().open).toBe(true);
    expect([...sheet().querySelectorAll('button[aria-pressed]')].map((element) => element.textContent?.trim())).toEqual(['Right', 'Left', 'Metronome', 'Count-in', 'Pedal']);

    const before = playback.pedalEnabled;
    chip(/Pedal/).click();
    expect(playback.pedalEnabled).toBe(!before);
  });

  it('has no button for going back to the start: Home does that', () => {
    const plain = [...bar().querySelectorAll('button')].filter((element) => !element.hasAttribute('aria-pressed'));
    expect(plain.map((element) => element.getAttribute('aria-label'))).toEqual(['Play', 'Bar 1 / 8 · Bookmarks', 'Tempo: 100%']);
  });

  describe('the bookmarks', () => {
    const panel = () => bar().querySelector<HTMLElement>('[role=group][aria-label=Bookmarks]');
    const field = (label: RegExp) => [...panel()!.querySelectorAll<HTMLInputElement>('input')].find((input) => label.test(input.getAttribute('aria-label') ?? ''))!;
    const type = (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    };
    const names = () => [...panel()!.querySelectorAll('.go')].map((row) => [...row.querySelectorAll('span')].map((part) => part.textContent).join(' · '));

    it('are added at the bar the music is in, named as the bar unless given a name, and gone to at a press', async () => {
      playback.seek(playback.score!.bars[2] + 0.1);
      await settled();
      button(/Bookmarks$/).click();
      await settled();
      expect(panel()!.textContent).toContain('No bookmarks yet');
      button(/^A bookmark at bar 3$/).click();
      await settled();
      type(field(/^A bookmark at bar 3$/), 'The climb');
      button(/^A bookmark at bar 3$/).click();
      await settled();
      expect(names()).toEqual(['Bar 3 · bar 3', 'The climb · bar 3']);

      playback.seek(0);
      await settled();
      panel()!.querySelector<HTMLElement>('.go')!.click();
      await settled();
      expect(playback.position).toBeCloseTo(playback.score!.bars[2]);
      // (Gone to: the panel is done with; it fades out first.)
      await vi.waitFor(() => expect(panel()).toBeNull());
    });

    it('are renamed and taken away in place', async () => {
      bookmarks.add('Theme', 1);
      bookmarks.add('Reprise', 5);
      button(/Bookmarks$/).click();
      await settled();
      button(/^Change: Theme$/).click();
      await settled();
      type(field(/^Bookmark’s name$/), 'Opening');
      button(/^Done$/).click();
      await settled();
      button(/^Change: Reprise$/).click();
      await settled();
      button(/^Remove$/).click();
      await settled();
      expect(names()).toEqual(['Opening · bar 1']);
    });

    it('are gone to by the keys 1 to 9, in order', () => {
      bookmarks.add('Theme', 1);
      bookmarks.add('Reprise', 5);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true }));
      expect(playback.position).toBeCloseTo(playback.score!.bars[4]);
    });
  });

  describe('the tempo', () => {
    const tempoPanel = () => bar().querySelector<HTMLElement>('[role=group][aria-label=Tempo]');

    it('is a button that says what it is, and opens a panel for setting it; Esc or a press elsewhere closes it', async () => {
      expect(tempoPanel()).toBeNull();
      button(/^Tempo: 100%$/).click();
      await settled();
      expect(tempoPanel()).not.toBeNull();

      window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // (It fades out first.)
      await vi.waitFor(() => expect(tempoPanel()).toBeNull());

      button(/^Tempo: 100%$/).click();
      await settled();
      tempoPanel()!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await settled();
      expect(tempoPanel()).not.toBeNull();
      root.querySelector('.stage')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      // (It fades out first.)
      await vi.waitFor(() => expect(tempoPanel()).toBeNull());
    });

    it('is set by a step slower or faster, or straight to one of the tempos pieces are learned at', async () => {
      button(/^Tempo: 100%$/).click();
      await settled();
      const presets = () => [...tempoPanel()!.querySelectorAll('.presets button[aria-pressed]')];
      expect(presets().map((element) => element.textContent?.trim())).toEqual(['50', '60', '70', '80', '90', '100']);

      button(/^Slower$/).click();
      await settled();
      expect(playback.tempo).toBe(0.95);
      expect(tempoPanel()!.querySelector('output')?.textContent).toContain('95%');
      expect(presets().filter((element) => element.getAttribute('aria-pressed') === 'true')).toHaveLength(0);

      chip(/^\s*70\s*$/).click();
      await settled();
      expect(playback.tempo).toBe(0.7);
      expect(button(/^Tempo: 70%$/)).toBeDefined();

      button(/^Faster$/).click();
      expect(playback.tempo).toBe(0.75);
    });

    it('is in a sheet on a phone', async () => {
      await turnIntoPhone();
      const sheet = bar().querySelector<HTMLDialogElement>('dialog[aria-label=Tempo]')!;
      expect(sheet.open).toBe(false);
      button(/^Tempo: 100%$/).click();
      await settled();
      expect(sheet.open).toBe(true);
      expect(sheet.querySelectorAll('.presets button[aria-pressed]')).toHaveLength(6);
    });

    it('has a trainer: on, it begins at its first tempo, says where it is taking the tempo, and asks for the loop', async () => {
      button(/^Tempo: 100%$/).click();
      await settled();
      const group = (name: string) => tempoPanel()!.querySelector<HTMLElement>(`[role=group][aria-label="${name}"]`);
      const choose = (name: string, label: string) => [...group(name)!.querySelectorAll('button')].find((choice) => choice.textContent?.trim() === label)!.click();
      expect(group('From')).toBeNull();

      choose('Tempo trainer', 'On');
      await settled();
      expect(playback.tempo).toBe(0.6);
      expect(button(/^Tempo: 60%$/).textContent).toContain('to 100%');
      expect(tempoPanel()!.textContent).toContain('switch the loop on');

      choose('From', '70%');
      choose('A step', '5%');
      await settled();
      expect(playback.tempo).toBe(0.7);
      playback.setLoop({ start: 0, end: 2 });
      await settled();
      expect(tempoPanel()!.textContent).not.toContain('switch the loop on');

      choose('Tempo trainer', 'Off');
      await settled();
      expect(group('From')).toBeNull();
      expect(button(/^Tempo: 70%$/).textContent).not.toContain('to 100%');
    });
  });
});
