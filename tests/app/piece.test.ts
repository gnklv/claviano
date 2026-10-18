// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { rereadPreferences } from '../../src/ui/preferences';
import { bookmarks, button, fingering, onPiece, playback, rollFrames, rollPointer, root, screen, settled, staffPointer, staffScores, turnIntoPhone, useApp } from './harness';

/* The piece's screen: getting to it and back, the keys of the computer, the view, the transport bar, a phone on its side. */

useApp();

it('opens a demo into the piece screen, under an address of its own, with the piece named in the header', async () => {
  button(/Ode to Joy/).click();
  await settled();
  expect(onPiece()).toBe(true);
  expect(location.hash).toBe('#/piece/demo.ode');
  expect(root.querySelector('.title')?.textContent).toMatch(/^Ode to Joy · 8 bars · \d+ notes$/);
  // Opening files and demos is the library's business: the piece's header has neither.
  expect(root.querySelector('input[type=file]')).toBeNull();
});

it('goes back to the library by the arrow, and the music stops', async () => {
  button(/Ode to Joy/).click();
  await settled();
  await playback.play();
  expect(playback.playing).toBe(true);

  button(/Back to the library/).click();
  await settled();
  expect(onPiece()).toBe(false);
  expect(location.hash).toBe('#/');
  expect(playback.playing).toBe(false);
});

it('goes back to the library by the browser’s Back, and to the piece again by Forward', async () => {
  button(/Ode to Joy/).click();
  await settled();
  location.hash = '#/';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(onPiece()).toBe(false);

  location.hash = '#/piece';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(onPiece()).toBe(true);
});

it('plays and steps by bars from the keyboard on the piece screen only', async () => {
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  press('Space');
  await settled();
  expect(playback.playing).toBe(false);

  button(/Ode to Joy/).click();
  await settled();
  press('ArrowRight');
  expect(playback.position).toBeCloseTo(playback.score!.bars[1]);
  press('Space');
  await settled();
  expect(playback.playing).toBe(true);
});

it('makes the tempo a step slower or faster by − and +, and the piece’s own again by 0', async () => {
  const press = (code: string, more = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...more }));
  button(/Ode to Joy/).click();
  await settled();
  press('Minus');
  press('Minus');
  expect(playback.tempo).toBe(0.9);
  press('Equal');
  expect(playback.tempo).toBe(0.95);
  press('Digit0');
  expect(playback.tempo).toBe(1);
  // Cmd and − is the browser's own: zooming out.
  press('Minus', { metaKey: true });
  expect(playback.tempo).toBe(1);
});

it('goes back to the start by Home, and goes on playing', async () => {
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  button(/Ode to Joy/).click();
  await settled();
  press('ArrowRight');
  press('ArrowRight');
  press('Space');
  await settled();
  press('Home');
  expect(playback.position).toBeCloseTo(0);
  expect(playback.playing).toBe(true);
});

describe('the view', () => {
  const views = () => [...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')];
  const stage = () => root.querySelector('.stage')!;

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
  });

  it('is the staff, the keys or both', async () => {
    expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys', 'Both']);
    views()[2].click();
    await settled();
    expect(stage().classList.contains('view-both')).toBe(true);
  });

  it('is not both on a phone held upright: the keys are shown, and the choice comes back with the room', async () => {
    views()[2].click();
    await settled();
    await turnIntoPhone();
    expect(views().map((view) => view.textContent?.trim())).toEqual(['Notes', 'Keys']);
    expect(stage().classList.contains('view-keys')).toBe(true);

    screen.phone = false;
    screen.listeners.forEach((listener) => listener());
    await nextTick();
    expect(stage().classList.contains('view-both')).toBe(true);
    views()[1].click();
    await settled();
  });
});

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

describe('one’s own fingering', () => {
  const press = () => {
    const staff = root.querySelector('.staff')!;
    staff.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    staff.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
  };
  const bar = () => root.querySelector('.finger-bar');
  const view = () => [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => choice.getAttribute('aria-pressed') === 'true')?.textContent?.trim();
  /** Fingering shown, as chosen in the settings. */
  const showFingering = async () => {
    localStorage.setItem('claviano.fingerHints', 'on');
    rereadPreferences();
    await settled();
  };

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
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

describe('a phone on its side', () => {
  const immersed = () => root.querySelector('.piece')!.classList.contains('immersed');
  const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const touch = (selector: string) => root.querySelector(selector)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
    screen.short = true;
    screen.listeners.forEach((listener) => listener());
    await nextTick();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => vi.useRealTimers());

  it('keeps what is set once a session behind "⋯", and offers the staff or the keys, not both', () => {
    const bar = root.querySelector('.transport')!;
    expect([...bar.querySelectorAll('button[aria-pressed]')].filter((element) => !element.closest('dialog'))).toHaveLength(1);
    expect(button(/^Practice$/)).toBeDefined();
    expect([...root.querySelector('.piece header [role=group][aria-label=View]')!.querySelectorAll('button')]).toHaveLength(2);
  });

  it('gives the screen to the music while it plays: the header and the transport go three seconds after the last touch', async () => {
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);

    press('Space');
    await vi.advanceTimersByTimeAsync(2900);
    expect(immersed()).toBe(false);
    touch('.transport');
    await vi.advanceTimersByTimeAsync(2900);
    expect(immersed()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(immersed()).toBe(true);
    expect(root.querySelector('.waker')).not.toBeNull();
  });

  it('brings them back at a touch, and for good when the music stops', async () => {
    press('Space');
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);

    touch('.waker');
    await vi.advanceTimersByTimeAsync(0);
    expect(immersed()).toBe(false);
    expect(root.querySelector('.waker')).toBeNull();
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);

    press('Space');
    await vi.advanceTimersByTimeAsync(0);
    expect(immersed()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);
  });

  describe('the staff, while they are away', () => {
    let stageHeight: number;
    /** Plays until they go, on the staff alone, 200 px tall beside them in a stage as tall. */
    const immerse = async () => {
      [...root.querySelectorAll<HTMLElement>('.piece header [role=group][aria-label=View] button')].find((choice) => choice.textContent?.trim() === 'Notes')!.click();
      await nextTick();
      stageHeight = 200;
      Object.defineProperty(root.querySelector('.stage')!, 'clientHeight', { get: () => stageHeight, configurable: true });
      Object.defineProperty(root.querySelector('.staff')!, 'clientHeight', { get: () => 200, configurable: true });
      press('Space');
      await vi.advanceTimersByTimeAsync(3100);
      expect(immersed()).toBe(true);
      stageHeight = 300;
      return root.querySelector<HTMLElement>('.staff')!;
    };

    it('keeps as tall as it was beside them, until they are back in place', async () => {
      const staff = await immerse();
      expect(staff.style.height).toBe('200px');
      touch('.waker');
      await vi.advanceTimersByTimeAsync(0);
      // (On their way back: the stage is still taller.)
      expect(staff.style.height).toBe('200px');
      stageHeight = 200;
      root.querySelector('.strip')!.dispatchEvent(new Event('transitionend'));
      await vi.advanceTimersByTimeAsync(0);
      expect(staff.style.height).toBe('');
    });

    it('is let go at once when they come back before they have gone', async () => {
      const staff = await immerse();
      stageHeight = 200;
      touch('.waker');
      await vi.advanceTimersByTimeAsync(0);
      expect(staff.style.height).toBe('');
    });
  });

  it('does not take them from under an open panel', async () => {
    press('Space');
    await vi.advanceTimersByTimeAsync(0);
    button(/^Settings$/).click();
    await vi.advanceTimersByTimeAsync(4000);
    expect(immersed()).toBe(false);
    button(/^Close$/).click();
    await vi.advanceTimersByTimeAsync(3100);
    expect(immersed()).toBe(true);
  });

  it('is not so on a screen of full height', async () => {
    screen.short = false;
    screen.listeners.forEach((listener) => listener());
    press('Space');
    await vi.advanceTimersByTimeAsync(5000);
    expect(immersed()).toBe(false);
  });
});
