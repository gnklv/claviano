import { readonly, ref, type Ref } from 'vue';

/*
 * Which screen is shown, kept in the address after the "#", so the browser's (and a phone's) Back
 * goes from a piece to the library instead of leaving the app, and Forward goes back in.
 * (After the "#", not as a path: the app is served as plain files, which know one address only.)
 *
 * A piece's address names the piece ("#/piece/<id>"), so a page reloaded there can open it again.
 */

/** ('design' is the page of the design system, shown in development only.) */
export type Screen = 'library' | 'piece' | 'play' | 'design';

const ADDRESSES: Record<Screen, string> = { library: '#/', piece: '#/piece', play: '#/play', design: '#/design' };
const PIECE_ADDRESS = /^#\/piece(?:\/([^/]+))?\/*$/;

/** The screen an address stands for; anything unknown is the library. */
export function screenAt(hash: string): Screen {
  if (PIECE_ADDRESS.test(hash)) return 'piece';
  const address = hash.replace(/\/+$/, '');
  return address === ADDRESSES.play ? 'play' : address === ADDRESSES.design ? 'design' : 'library';
}

/** The piece an address names; null for the library's, or a piece's address without a name. */
export function pieceAt(hash: string): string | null {
  const id = PIECE_ADDRESS.exec(hash)?.[1];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}

const pieceAddress = (id: string | null): string => (id === null ? ADDRESSES.piece : `${ADDRESSES.piece}/${encodeURIComponent(id)}`);

export interface Navigation {
  readonly screen: Readonly<Ref<Screen>>;
  /** The piece the address names, while the piece's screen is shown. */
  readonly piece: Readonly<Ref<string | null>>;
  /**
   * Shows a screen. From the library to a piece is a step forward; back to the library is a step
   * back. Asked for the piece while it is shown (another piece has opened in its place), it sets
   * the address right, without a step.
   */
  go(screen: Screen): void;
  /** Stops listening to the address. */
  dispose(): void;
}

/**
 * `canShow`: whether a screen has what it needs (a piece to show) and is there at all (the design
 * page is not, outside development). An address that cannot be shown, such as a piece's after the
 * page is reloaded and the piece is gone, leads to the library.
 * `openPiece`: the id of the piece that is open, for its address. `askFor`: told the piece an
 * address names when it is not the one that is open (the page was loaded there, an address was
 * typed in, the browser went Forward to it), so that it can be opened.
 */
export function createNavigation(
  canShow: (screen: Screen) => boolean,
  openPiece: () => string | null = () => null,
  askFor: (piece: string) => void = () => {},
): Navigation {
  const screen = ref<Screen>('library');
  const piece = ref<string | null>(null);
  /** The library is one step back in the browser's history: going to it is going back. */
  let libraryBehind = false;

  const settle = () => {
    const asked = screenAt(location.hash);
    const named = pieceAt(location.hash);
    if (named !== null && named !== openPiece()) askFor(named);
    if (!canShow(asked)) {
      // Not a step in the history: Back from here must not come to this address again.
      history.replaceState(null, '', ADDRESSES.library);
      libraryBehind = false;
      screen.value = 'library';
      piece.value = null;
      return;
    }
    if (asked === 'library') libraryBehind = false;
    screen.value = asked;
    piece.value = asked === 'piece' ? named : null;
  };
  settle();
  window.addEventListener('hashchange', settle);

  return {
    screen: readonly(screen),
    piece: readonly(piece),
    go(next) {
      if (!canShow(next)) return;
      if (next === 'piece' && screen.value === 'piece') {
        const address = pieceAddress(openPiece());
        if (location.hash !== address) history.replaceState(null, '', address);
        piece.value = openPiece();
        return;
      }
      if (next === screen.value) return;
      if (next === 'piece' && screen.value === 'play') {
        // What was played has become a piece: it takes free play's place, so Back from it is the library.
        history.replaceState(null, '', pieceAddress(openPiece()));
        piece.value = openPiece();
      } else if (next === 'piece') {
        libraryBehind = true;
        location.hash = pieceAddress(openPiece());
        piece.value = openPiece();
      } else if (next !== 'library') {
        libraryBehind = true;
        location.hash = ADDRESSES[next];
        piece.value = null;
      } else if (libraryBehind) {
        history.back();
      } else {
        location.hash = ADDRESSES.library;
      }
      // (The address tells the rest when it changes; shown at once, without waiting for it.)
      screen.value = next;
    },
    dispose: () => window.removeEventListener('hashchange', settle),
  };
}
