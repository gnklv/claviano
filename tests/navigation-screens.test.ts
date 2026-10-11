// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNavigation, pieceAt, screenAt, type Navigation } from '../src/ui/navigation/useScreen';

/* Which screen is shown, and how the browser's Back and Forward move between them. */

let hasPiece: boolean;
/** The piece that is open, for its address. */
let openPiece: string | null;
/** The pieces the addresses named, that were not open. */
let askedFor: string[];
let navigation: Navigation;
let back: ReturnType<typeof vi.spyOn>;
let opened = false;
const open = (hash = '') => {
  location.hash = hash;
  navigation = createNavigation(
    (screen) => screen !== 'piece' || hasPiece,
    () => openPiece,
    (piece) => askedFor.push(piece),
  );
  opened = true;
};
/** The browser moves through its history: the address changes, and the page is told. */
const browserGoesTo = (hash: string) => {
  location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
};

beforeEach(() => {
  hasPiece = false;
  openPiece = null;
  askedFor = [];
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

describe('pieceAt', () => {
  it('reads the piece an address names', () => {
    expect(pieceAt('#/piece/abc-123')).toBe('abc-123');
    expect(pieceAt('#/piece/demo.ode/')).toBe('demo.ode');
    expect(pieceAt('#/piece/a%20b')).toBe('a b');
    expect(screenAt('#/piece/abc-123')).toBe('piece');
  });

  it('reads none from the library’s address, a piece’s without a name, or a mangled one', () => {
    expect(['#/', '#/piece', '#/piece/', '#/piece/%E0%A4%A', '#/piece/a/b'].map(pieceAt)).toEqual(Array(5).fill(null));
    expect(screenAt('#/piece/a/b')).toBe('library');
  });
});

describe('a piece’s address', () => {
  it('names the piece that is open', () => {
    hasPiece = true;
    openPiece = 'abc-123';
    open();
    navigation.go('piece');
    expect(location.hash).toBe('#/piece/abc-123');
    expect(navigation.piece.value).toBe('abc-123');
  });

  it('is set right, without a step in the history, when another piece opens in its place', () => {
    hasPiece = true;
    openPiece = 'abc-123';
    open();
    navigation.go('piece');
    const steps = history.length;
    openPiece = 'def-456';
    navigation.go('piece');
    expect(location.hash).toBe('#/piece/def-456');
    expect(navigation.piece.value).toBe('def-456');
    expect(history.length).toBe(steps);
  });

  it('asks for the piece it names when that is not the open one: at the start, and as the browser moves', () => {
    open('#/piece/abc-123');
    expect(askedFor).toEqual(['abc-123']);
    // (Nothing to show yet: the library, until the piece opens.)
    expect(navigation.screen.value).toBe('library');

    hasPiece = true;
    openPiece = 'abc-123';
    navigation.go('piece');
    browserGoesTo('#/');
    browserGoesTo('#/piece/abc-123');
    expect(askedFor).toEqual(['abc-123']);
    browserGoesTo('#/piece/def-456');
    expect(askedFor).toEqual(['abc-123', 'def-456']);
  });

  it('is told as the browser moves to it, and is none in the library', () => {
    hasPiece = true;
    open();
    browserGoesTo('#/piece/abc-123');
    expect(navigation.piece.value).toBe('abc-123');
    browserGoesTo('#/');
    expect(navigation.piece.value).toBeNull();
  });
});

describe('free play', () => {
  it('has an address of its own, a step forward from the library and a step back to it', () => {
    expect(screenAt('#/play')).toBe('play');
    expect(screenAt('#/play/')).toBe('play');
    open();
    navigation.go('play');
    expect(navigation.screen.value).toBe('play');
    expect(location.hash).toBe('#/play');
    navigation.go('library');
    expect(back).toHaveBeenCalledTimes(1);
    expect(navigation.screen.value).toBe('library');
  });

  it('is shown when the page is loaded at its address: it needs nothing', () => {
    open('#/play');
    expect(navigation.screen.value).toBe('play');
    expect(navigation.piece.value).toBeNull();
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

describe('the page of the design system', () => {
  it('has an address of its own where it is there to show', () => {
    expect(screenAt('#/design')).toBe('design');
    open('#/design');
    expect(navigation.screen.value).toBe('design');
  });

  it('is the library where it is not (outside development)', () => {
    location.hash = '#/design';
    navigation = createNavigation((screen) => screen !== 'design');
    opened = true;
    expect(navigation.screen.value).toBe('library');
    expect(location.hash).toBe('#/');
  });
});
