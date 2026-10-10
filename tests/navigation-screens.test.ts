// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNavigation, screenAt, type Navigation } from '../src/ui/navigation/useScreen';

/* Which screen is shown, and how the browser's Back and Forward move between them. */

let hasPiece: boolean;
let navigation: Navigation;
let back: ReturnType<typeof vi.spyOn>;
let opened = false;
const open = (hash = '') => {
  location.hash = hash;
  navigation = createNavigation((screen) => screen === 'library' || hasPiece);
  opened = true;
};
/** The browser moves through its history: the address changes, and the page is told. */
const browserGoesTo = (hash: string) => {
  location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
};

beforeEach(() => {
  hasPiece = false;
  back = vi.spyOn(history, 'back').mockImplementation(() => browserGoesTo('#/'));
});
afterEach(() => {
  if (opened) navigation.dispose();
  opened = false;
  vi.restoreAllMocks();
  location.hash = '';
});

describe('screenAt', () => {
  it('reads the screen from the address, and takes anything unknown for the library', () => {
    expect(screenAt('#/piece')).toBe('piece');
    expect(screenAt('#/piece/')).toBe('piece');
    expect(['', '#', '#/', '#/library', '#/something', '#piece'].map(screenAt)).toEqual(Array(6).fill('library'));
  });
});

describe('navigation between screens', () => {
  it('starts in the library', () => {
    open();
    expect(navigation.screen.value).toBe('library');
  });

  it('goes to the piece once one is open, with an address of its own', () => {
    open();
    navigation.go('piece');
    expect(navigation.screen.value).toBe('library');

    hasPiece = true;
    navigation.go('piece');
    expect(navigation.screen.value).toBe('piece');
    expect(location.hash).toBe('#/piece');
  });

  it('goes back to the library as a step back in the history, so Back from the library leaves the app', () => {
    hasPiece = true;
    open();
    navigation.go('piece');
    navigation.go('library');
    expect(back).toHaveBeenCalledOnce();
    expect(navigation.screen.value).toBe('library');
    expect(location.hash).toBe('#/');
  });

  it('follows the browser’s Back and Forward', () => {
    hasPiece = true;
    open();
    navigation.go('piece');
    browserGoesTo('#/');
    expect(navigation.screen.value).toBe('library');
    browserGoesTo('#/piece');
    expect(navigation.screen.value).toBe('piece');
  });

  it('opens in the library when the address is a piece’s and no piece is there (the page was reloaded)', () => {
    const replaced = vi.spyOn(history, 'replaceState');
    open('#/piece');
    expect(navigation.screen.value).toBe('library');
    // The address is put right in place: Back must not lead to the piece's address again.
    expect(replaced).toHaveBeenCalledWith(null, '', '#/');
  });

  it('does not show a piece that is gone when the browser goes Forward to it', () => {
    hasPiece = true;
    open();
    navigation.go('piece');
    browserGoesTo('#/');
    hasPiece = false;
    browserGoesTo('#/piece');
    expect(navigation.screen.value).toBe('library');
  });

  it('goes to the library by its address when there is no step back to take', () => {
    hasPiece = true;
    open('#/piece');
    expect(navigation.screen.value).toBe('piece');
    navigation.go('library');
    expect(back).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/');
    expect(navigation.screen.value).toBe('library');
  });

  it('stops listening when it is done with', () => {
    hasPiece = true;
    open();
    navigation.dispose();
    browserGoesTo('#/piece');
    expect(navigation.screen.value).toBe('library');
  });
});
