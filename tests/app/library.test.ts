// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { button, drop, onPiece, playback, restart, root, settled, shelf, text, useApp, xml } from './harness';

/* The library: what it shows, what it keeps, and what can be done with a piece on its shelf. */

useApp();

it('starts in the library: a file to open, the demos, and a word about dropping a file', () => {
  expect(onPiece()).toBe(false);
  expect(text()).toContain('Open file');
  expect(text()).toContain('Ode to Joy');
  expect(text()).toContain('drop a file');
  expect(root.querySelector('input[type=file]')).not.toBeNull();
});

it('says in the library what did not open, and stays there', async () => {
  button(/Showcase/).click();
  await settled();
  expect(onPiece()).toBe(false);
  expect(root.querySelector('[role=alert]')?.textContent).toMatch(/Showcase.*unexpected error/);

  await drop('photo.jpg', 'not music');
  expect(root.querySelector('[role=alert]')?.textContent).toMatch(/photo\.jpg.*not supported/);
  // A piece that opens clears it.
  button(/Ode to Joy/).click();
  await settled();
  button(/Back to the library/).click();
  await settled();
  expect(root.querySelector('[role=alert]')).toBeNull();
});

describe('the shelf', () => {
  const cards = () => [...root.querySelectorAll('.cards .name')].map((name) => name.textContent);
  it('keeps a file that was opened: it stands in the library, the latest first, before the demos', async () => {
    await drop('first.musicxml', xml('First'));
    await drop('second.musicxml', xml('Second'));
    button(/Back to the library/).click();
    await settled();
    expect(cards()).toEqual(['Second', 'First', 'Ode to Joy', 'Showcase: everything the player can do']);
    expect(root.querySelectorAll('.cards .note')[0]?.textContent).toBe('today');
  });

  it('has the demos apart, under a heading of their own, after one’s own pieces', async () => {
    await drop('first.musicxml', xml('First'));
    button(/Back to the library/).click();
    await settled();
    const sections = [...root.querySelectorAll('.shelf h2')].map((heading) => [
      heading.textContent,
      [...heading.nextElementSibling!.querySelectorAll('.name')].map((name) => name.textContent),
    ]);
    expect(sections).toEqual([
      ['My pieces', ['First']],
      ['Demos', ['Ode to Joy', 'Showcase: everything the player can do']],
    ]);
    // Over both, apart from the pieces: what can be begun.
    expect([...root.querySelectorAll('.actions .name')].map((name) => name.textContent)).toEqual(['Open file', 'Free play']);
  });

  it('has no heading for one’s own pieces while there are none', () => {
    expect([...root.querySelectorAll('.shelf h2')].map((heading) => heading.textContent)).toEqual(['Demos']);
  });

  it('does not keep what did not open, and keeps one card for a file opened twice', async () => {
    await drop('photo.jpg', 'not music');
    await drop('first.musicxml', xml('First'));
    await drop('renamed.musicxml', xml('First'));
    button(/Back to the library/).click();
    await settled();
    expect(cards().filter((name) => name === 'First')).toHaveLength(1);
    expect(shelf.pieces.size).toBe(1);
  });

  it('opens a piece from its card, and still has it after the page is loaded again', async () => {
    await drop('first.musicxml', xml('First'));
    await restart();
    location.hash = '#/';
    await restart();
    expect(onPiece()).toBe(false);
    button(/^First/).click();
    await settled();
    expect(onPiece()).toBe(true);
    expect(root.querySelector('.title')?.textContent).toContain('First');
  });

  it('gives a piece an address of its own: a page loaded there opens that piece again', async () => {
    await drop('first.musicxml', xml('First'));
    const address = location.hash;
    expect(address).toMatch(/^#\/piece\/[a-z0-9]+-[a-z0-9]+$/);
    await drop('second.musicxml', xml('Second'));
    expect(location.hash).not.toBe(address);

    location.hash = address;
    await restart();
    expect(onPiece()).toBe(true);
    expect(root.querySelector('.title')?.textContent).toContain('First');
    expect(location.hash).toBe(address);
    // So does a demo's.
    location.hash = '#/piece/demo.ode';
    await restart();
    expect(root.querySelector('.title')?.textContent).toContain('Ode to Joy');
  });

  it('comes back to a piece where it was left: the place, the tempo, the loop, the hands; and says the place on its card', async () => {
    button(/Ode to Joy/).click();
    await settled();
    playback.setTempo(0.7);
    playback.setHandEnabled('left', false);
    playback.seek(playback.score!.bars[4] + 0.1);
    button(/Back to the library/).click();
    await settled();
    expect(button(/Ode to Joy/).textContent).toMatch(/bar 5 of 8/);

    location.hash = '#/';
    await restart();
    expect(button(/Ode to Joy/).textContent).toMatch(/bar 5 of 8/);
    button(/Ode to Joy/).click();
    await settled();
    expect(playback.tempo).toBe(0.7);
    expect(playback.isHandEnabled('left')).toBe(false);
    expect(playback.position).toBeCloseTo(playback.score!.bars[4] + 0.1);
    expect(button(/^Tempo: 70%$/)).toBeDefined();
  });

  it('says on a card where its piece was left, before the day', async () => {
    await drop('first.musicxml', xml('First'));
    playback.seek(0.5);
    button(/Back to the library/).click();
    await settled();
    expect(button(/^First/).querySelector('.note')?.textContent).toBe('bar 1 of 1 · today');
  });

  describe('a piece’s card', () => {
    const menuItem = (label: RegExp) => [...root.querySelectorAll<HTMLElement>('[role=menuitem]')].find((item) => label.test(item.textContent ?? ''))!;
    const openMenu = async (title: string) => {
      button(new RegExp(`^Actions: ${title}$`)).click();
      await settled();
    };

    beforeEach(async () => {
      await drop('first.musicxml', xml('First'));
      button(/Back to the library/).click();
      await settled();
    });

    it('has behind "⋯" what can be done with the piece; the demos have no such thing', async () => {
      expect(root.querySelectorAll('[role=menu]')).toHaveLength(0);
      expect(root.querySelectorAll('button[aria-label^="Actions"]')).toHaveLength(1);
      await openMenu('First');
      expect([...root.querySelectorAll('[role=menuitem]')].map((item) => item.textContent)).toEqual(['Rename', 'Save as a file', 'Remove from the shelf']);

      window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // (It fades out first.)
      await vi.waitFor(() => expect(root.querySelectorAll('[role=menu]')).toHaveLength(0));
    });

    it('gives the piece another name, there and in the piece’s header, kept when the page is loaded again', async () => {
      await openMenu('First');
      menuItem(/Rename/).click();
      await settled();
      const field = root.querySelector<HTMLInputElement>('input[aria-label=Title]')!;
      expect(field.value).toBe('First');
      field.value = '  Für Elise ';
      field.dispatchEvent(new Event('input'));
      field.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settled();
      expect(cards()).toContain('Für Elise');
      expect(cards()).not.toContain('First');

      await restart();
      button(/^Für Elise/).click();
      await settled();
      expect(root.querySelector('.title')?.textContent).toMatch(/^Für Elise · /);
    });

    it('keeps the name as it was when the renaming is given up by Esc, or leaves it empty', async () => {
      for (const [typed, key] of [
        ['Something else', 'Escape'],
        ['   ', 'Enter'],
      ] as const) {
        await openMenu('First');
        menuItem(/Rename/).click();
        await settled();
        const field = root.querySelector<HTMLInputElement>('input[aria-label=Title]')!;
        field.value = typed;
        field.dispatchEvent(new Event('input'));
        if (key === 'Escape') field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        else field.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await settled();
        expect(root.querySelector('input[aria-label=Title]')).toBeNull();
        expect(cards()).toContain('First');
      }
    });

    it('saves the piece’s file out, as it was given', async () => {
      const saved: { name: string; size: number }[] = [];
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => `blob:${blob.size}`, revokeObjectURL: () => {} }));
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        saved.push({ name: this.download, size: Number(this.href.replace('blob:', '')) });
      });
      await openMenu('First');
      menuItem(/Save as a file/).click();
      await settled();
      expect(saved).toEqual([{ name: 'first.musicxml', size: new TextEncoder().encode(xml('First')).length }]);
      vi.unstubAllGlobals();
    });

    it('takes the piece off the shelf when asked twice, for good', async () => {
      await openMenu('First');
      menuItem(/Remove from the shelf/).click();
      await settled();
      expect(cards()).toContain('First');
      menuItem(/Remove for good\?/).click();
      await settled();
      expect(cards()).not.toContain('First');
      expect(shelf.pieces.size).toBe(0);
      expect(shelf.files.size).toBe(0);
      // (It was the piece last open: taking it off the shelf does not lead back into it.)
      expect(onPiece()).toBe(false);

      await restart();
      expect(cards()).not.toContain('First');
    });

    it('forgets the first "remove" when the menu is closed', async () => {
      await openMenu('First');
      menuItem(/Remove from the shelf/).click();
      await settled();
      root.querySelector('.shelf')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await settled();
      await openMenu('First');
      expect(menuItem(/Remove from the shelf/)).toBeDefined();
      expect(cards()).toContain('First');
    });
  });

  it('opens in the library when the address names a piece that is not there', async () => {
    location.hash = '#/piece/gone-123';
    await restart();
    expect(onPiece()).toBe(false);
    expect(location.hash).toBe('#/');
  });

  it('goes on without a shelf where the browser gives no storage: pieces open, nothing is kept', async () => {
    shelf.broken = true;
    await restart();
    await drop('first.musicxml', xml('First'));
    expect(onPiece()).toBe(true);
    button(/Back to the library/).click();
    await settled();
    expect(cards()).toEqual(['Ode to Joy', 'Showcase: everything the player can do']);
    // And says so, once, in the library.
    expect(root.querySelector('[role=status]')?.textContent).toMatch(/not kept here/);
  });

  it('says nothing about storage where there is some', async () => {
    await drop('first.musicxml', xml('First'));
    button(/Back to the library/).click();
    await settled();
    expect(root.querySelector('[role=status]')).toBeNull();
  });
});

it('opens a file dropped onto the window from either screen', async () => {
  await drop('first.musicxml', xml('First'));
  expect(onPiece()).toBe(true);
  expect(root.querySelector('.title')?.textContent).toContain('First');

  await drop('second.musicxml', xml('Second'));
  expect(root.querySelector('.title')?.textContent).toContain('Second');
  // A file that does not open leaves the piece where it is, and says so in the header.
  await drop('photo.jpg', 'not music');
  expect(onPiece()).toBe(true);
  expect(root.querySelector('.title[role=alert]')?.textContent).toMatch(/photo\.jpg/);
  expect(playback.score?.title).toBe('Second');
});
