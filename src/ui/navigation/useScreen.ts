import { readonly, ref, type Ref } from 'vue';

/*
 * Which screen is shown, kept in the address after the "#", so the browser's (and a phone's) Back
 * goes from a piece to the library instead of leaving the app, and Forward goes back in.
 * (After the "#", not as a path: the app is served as plain files, which know one address only.)
 */

export type Screen = 'library' | 'piece';

const ADDRESSES: Record<Screen, string> = { library: '#/', piece: '#/piece' };

/** The screen an address stands for; anything unknown is the library. */
export const screenAt = (hash: string): Screen => (hash.replace(/\/+$/, '') === ADDRESSES.piece ? 'piece' : 'library');

export interface Navigation {
  readonly screen: Readonly<Ref<Screen>>;
  /** Shows a screen. From the library to a piece is a step forward; back to the library is a step back. */
  go(screen: Screen): void;
  /** Stops listening to the address. */
  dispose(): void;
}

/**
 * `canShow`: whether a screen has what it needs (a piece to show). An address that cannot be
 * shown, such as a piece's after the page is reloaded and the piece is gone, leads to the library.
 */
export function createNavigation(canShow: (screen: Screen) => boolean): Navigation {
  const screen = ref<Screen>('library');
  /** The library is one step back in the browser's history: going to it is going back. */
  let libraryBehind = false;

  const settle = () => {
    const asked = screenAt(location.hash);
    if (asked === 'piece' && !canShow('piece')) {
      // Not a step in the history: Back from here must not come to this address again.
      history.replaceState(null, '', ADDRESSES.library);
      libraryBehind = false;
      screen.value = 'library';
      return;
    }
    if (asked === 'library') libraryBehind = false;
    screen.value = asked;
  };
  settle();
  window.addEventListener('hashchange', settle);

  return {
    screen: readonly(screen),
    go(next) {
      if (next === screen.value || !canShow(next)) return;
      if (next === 'piece') {
        libraryBehind = true;
        location.hash = ADDRESSES.piece;
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
