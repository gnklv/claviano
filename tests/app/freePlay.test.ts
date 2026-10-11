// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { audio, button, onPiece, playback, root, settled, shelf, staffScores, tilesShown, useApp } from './harness';

/** A quarter note of the music font (SMuFL), as the tempo is written with. */
const QUARTER_NOTE = '\ue1d5';

/* Free play: the keyboard, what is played, and recording it. */

useApp();

describe('free play', () => {
  const key = (pitch: number) => root.querySelector<HTMLElement>(`[data-pitch="${pitch}"]`)!;
  const press = (code: string, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const held = () => audio.struck.filter((struck) => struck.released === null).map((struck) => struck.pitch);

  beforeEach(async () => {
    button(/Free play/).click();
    await settled();
  });

  it('is a screen of its own, come to from the library and left by the arrow', async () => {
    expect(location.hash).toBe('#/play');
    expect(root.querySelector('.free-play')).not.toBeNull();
    expect(root.querySelector('.title')?.textContent).toBe('Free play');
    button(/Back to the library/).click();
    await settled();
    expect(root.querySelector('.free-play')).toBeNull();
    expect(location.hash).toBe('#/');
  });

  it('has a keyboard from a Do, white keys and black, the Dos named', () => {
    const pitches = [...root.querySelectorAll<HTMLElement>('[data-pitch]')].map((shown) => Number(shown.dataset.pitch)).sort((a, b) => a - b);
    expect(pitches[0]).toBe(48);
    expect(pitches).toHaveLength(25);
    expect(root.querySelectorAll('.key.black')).toHaveLength(10);
    expect(key(48).textContent).toContain('C3');
    expect(key(60).textContent).toContain('C4');
  });

  it('sounds a key for as long as a letter of the computer’s keyboard is held, and lights it', async () => {
    press('KeyA');
    press('KeyW');
    await settled();
    expect(held()).toEqual([48, 49]);
    expect(key(48).classList.contains('down')).toBe(true);
    expect(key(49).classList.contains('down')).toBe(true);
    // (Lit in the colour of the hand that would play it: under middle Do, the left.)
    expect(key(48).classList.contains('left')).toBe(true);
    expect(key(60)?.classList.contains('right') ?? true).toBe(true);
    // (A held key repeats itself: one strike all the same.)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', repeat: true }));
    expect(audio.struck).toHaveLength(2);

    press('KeyA', 'keyup');
    await settled();
    expect(held()).toEqual([49]);
    expect(key(48).classList.contains('down')).toBe(false);
  });

  it('hands what is played to the tiles over the keyboard: each key from when it went down to when it came up', async () => {
    const frame = () => new Promise((resolve) => setTimeout(resolve, 50));
    audio.time = 1;
    press('KeyA');
    await frame();
    expect(tilesShown).toEqual([{ pitch: 48, start: 1, end: null }]);
    audio.time = 1.5;
    press('KeyA', 'keyup');
    await frame();
    expect(tilesShown).toEqual([{ pitch: 48, start: 1, end: 1.5 }]);
    // Once it has floated out of sight (five seconds, says the view), it is forgotten.
    audio.time = 7;
    await frame();
    expect(tilesShown).toEqual([]);
  });

  it('moves the keyboard by octaves, from the buttons and by Z and X', async () => {
    button(/^An octave higher$/).click();
    await settled();
    expect(key(60).textContent).toContain('A');
    press('KeyZ');
    press('KeyZ');
    await settled();
    expect(root.querySelector('[data-pitch="36"]')).not.toBeNull();
    press('KeyA');
    expect(held()).toEqual([36]);
  });

  it('lets every key go when the screen is left', async () => {
    press('KeyA');
    press('KeyD');
    button(/Back to the library/).click();
    await settled();
    expect(held()).toEqual([]);
    // And the letters play nothing elsewhere.
    press('KeyG');
    expect(audio.struck).toHaveLength(2);
  });

  describe('recording', () => {
    const status = () => root.querySelector('.record-bar [role=status]')?.textContent ?? '';

    it('begins with the first note played, not with the button, and counts the bars to the metronome', async () => {
      button(/^Record$/).click();
      await settled();
      expect(status()).toMatch(/first note starts/);
      // The metronome is on from the button: something to come in on.
      expect(audio.clicks.length).toBeGreaterThan(0);

      audio.time = 3.2;
      press('KeyA');
      await settled();
      expect(status()).toMatch(/^Recording/);
      expect(button(/^Stop$/)).toBeDefined();
    });

    it('ends at "Stop": the take is there, to record over or to discard', async () => {
      button(/^Record$/).click();
      press('KeyA');
      audio.time = 1;
      press('KeyA', 'keyup');
      press('KeyS');
      audio.time = 2;
      await settled();
      button(/^Stop$/).click();
      await settled();
      expect(status()).toBe('Recorded: 2 notes');

      button(/^Discard$/).click();
      await settled();
      expect(status()).toBe('');
      expect(button(/^Record$/)).toBeDefined();
    });

    it('writes the take down as notes while it is played, on the beat of the metronome', async () => {
      expect(root.querySelector('.take-staff')).toBeNull();
      button(/^Record$/).click();
      // (The first bar begins with the metronome's first click, at 0.1.)
      audio.time = 0.12;
      press('KeyA');
      audio.time = 0.8;
      press('KeyA', 'keyup');
      audio.time = 0.86;
      press('KeyK');
      await settled();
      expect(root.querySelector('.take-staff')).not.toBeNull();
      expect(root.querySelector('.caveat')).toBeNull();
      const written = staffScores.at(-1)!;
      expect(written.notes.map((note) => [note.pitch, note.beat])).toEqual([
        [48, 0],
        [60, 1],
      ]);
      expect(written.notation.tempoMarks[0]?.perMinute).toBe(80);

      button(/^Stop$/).click();
      await settled();
      expect(root.querySelector('.take-staff')).not.toBeNull();
      button(/^Discard$/).click();
      await settled();
      expect(root.querySelector('.take-staff')).toBeNull();
    });

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

    it('plays the take back, and stops when asked', async () => {
      await recordTwoBars();
      const before = audio.played.length;
      button(/Listen$/).click();
      await settled();
      expect(audio.played.slice(before).map((note) => note.pitch)).toEqual([48, 60]);
      expect(button(/Stop$/)).toBeDefined();
      const stops = audio.stops;
      button(/Stop$/).click();
      await settled();
      expect(audio.stops).toBe(stops + 1);
      expect(button(/Listen$/)).toBeDefined();
    });

    it('takes the last bar off the take, and the take itself with its only bar', async () => {
      await recordTwoBars();
      button(/^Erase the last bar$/).click();
      await settled();
      expect(status()).toBe('Recorded: 1 note');
      expect(staffScores.at(-1)?.bars).toHaveLength(1);
      button(/^Erase the last bar$/).click();
      await settled();
      expect(status()).toBe('');
      expect(button(/^Record$/)).toBeDefined();
    });

    it('keeps the take as a piece: on the shelf, named by when it was played, and opened to be learned', async () => {
      await recordTwoBars();
      button(/^Save as a piece$/).click();
      await settled();
      expect(onPiece()).toBe(true);
      expect(root.querySelector('.title')?.textContent).toMatch(/^Played on .+ · 2 bars · 2 notes$/);
      expect(playback.score?.notes.map((note) => [note.pitch, note.beat, note.hand])).toEqual([
        [48, 0, 'left'],
        [60, 4, 'right'],
      ]);
      expect([...shelf.pieces.values()].map((piece) => piece.fileName)).toEqual([expect.stringMatching(/^claviano-[\d-]+\.mid$/)]);

      // Back from it is the library, not free play again; and the take is done with.
      button(/Back to the library/).click();
      await settled();
      expect(root.querySelector('.library')).not.toBeNull();
      expect([...root.querySelectorAll('.cards .name')].map((name) => name.textContent)[0]).toMatch(/^Played on /);
      button(/Free play/).click();
      await settled();
      expect(status()).toBe('');
    });

    it('says the bars are a guess for a take played without the metronome', async () => {
      button(/^Metronome$/).click();
      button(/^Record$/).click();
      press('KeyA');
      await settled();
      expect(root.querySelector('.caveat')?.textContent).toMatch(/bars are a guess/);
    });

    it('holds the tempo, the time signature and the metronome through a take', async () => {
      button(/^Faster$/).click();
      await settled();
      expect(root.querySelector('.record-bar output')?.textContent).toBe(`${QUARTER_NOTE} = 84`);
      button(/^3\/4$/).click();
      await settled();
      expect(button(/^3\/4$/).getAttribute('aria-pressed')).toBe('true');

      button(/^Record$/).click();
      await settled();
      expect((button(/^Faster$/) as HTMLButtonElement).disabled).toBe(true);
      expect((button(/^Metronome$/) as HTMLButtonElement).disabled).toBe(true);
    });

    it('ends the take when the screen is left', async () => {
      button(/^Record$/).click();
      press('KeyA');
      button(/Back to the library/).click();
      await settled();
      button(/Free play/).click();
      await settled();
      expect(status()).toBe('Recorded: 1 note');
    });
  });

  it('stops the piece that was playing', async () => {
    button(/Back to the library/).click();
    await settled();
    button(/Ode to Joy/).click();
    await settled();
    await playback.play();
    location.hash = '#/play';
    window.dispatchEvent(new Event('hashchange'));
    await settled();
    expect(root.querySelector('.free-play')).not.toBeNull();
    expect(playback.playing).toBe(false);
  });
});
