import { stepBar } from '../../application/use-cases/stepBar';
import { stepTempo } from '../../application/use-cases/stepTempo';
import { useWindowListener } from '../browser/useWindowListener';
import { useDeps } from '../deps';

/** Keys for the tempo: a step slower, a step faster, and back to the piece's own. */
const TEMPO_KEYS: Partial<Record<string, -1 | 0 | 1>> = { Minus: -1, NumpadSubtract: -1, Equal: 1, NumpadAdd: 1, Digit0: 0, Numpad0: 0 };

/**
 * The keys of the computer's keyboard that play the piece, while `onPiece()` says its screen is
 * shown (in the library there is nothing for them to do): Space plays and pauses, the arrows step
 * by bars, Home goes to the start, − + 0 set the tempo, 1–9 go to the bookmarks.
 */
export function usePieceKeys(onPiece: () => boolean): void {
  const { playback, bookmarks } = useDeps();

  function onKeyDown(event: KeyboardEvent): void {
    if (!onPiece()) return;
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    // Typing (a bar number, a bookmark's name) is left alone; so are the arrows and Home on a slider (tempo, position), which move it.
    if (input?.type === 'number' || input?.type === 'text') return;
    const arrow = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    if ((arrow || event.code === 'Home') && input) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (playback.playing) playback.pause();
      else void playback.play();
    } else if (/^Digit[1-9]$/.test(event.code) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // The bookmarks, in order.
      event.preventDefault();
      bookmarks.goTo(Number(event.code.slice(5)) - 1);
    } else if (arrow) {
      event.preventDefault();
      stepBar(playback, event.code === 'ArrowLeft' ? -1 : 1);
    } else if (TEMPO_KEYS[event.code] !== undefined && !event.metaKey && !event.ctrlKey) {
      // (Not with Cmd or Ctrl: those zoom the page.)
      event.preventDefault();
      if (TEMPO_KEYS[event.code] === 0) playback.setTempo(1);
      else stepTempo(playback, TEMPO_KEYS[event.code]!);
    } else if (event.code === 'Home') {
      // To the start (of the loop, when one is on); what plays goes on playing from there.
      event.preventDefault();
      playback.seek(0);
    }
  }

  /** Otherwise Space would also "click" whichever button or checkbox has focus. */
  function onKeyUp(event: KeyboardEvent): void {
    if (onPiece() && event.code === 'Space') event.preventDefault();
  }

  useWindowListener('keydown', onKeyDown);
  useWindowListener('keyup', onKeyUp);
}
