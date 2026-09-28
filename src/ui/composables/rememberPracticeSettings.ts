import type { Playback } from '../../application/use-cases/Playback';

const STORAGE_KEY = 'claviano.practice';

interface Saved {
  metronome?: boolean;
  countIn?: boolean;
}

/** Restores the metronome and count-in choices from the last visit, and keeps them saved. */
export function rememberPracticeSettings(playback: Playback): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved;
    if (typeof saved.metronome === 'boolean') playback.setMetronomeEnabled(saved.metronome);
    if (typeof saved.countIn === 'boolean') playback.setCountInEnabled(saved.countIn);
  } catch {
    // Storage can be unavailable or hold something else; the defaults are fine.
  }

  let last = '';
  playback.onChange(() => {
    const value = JSON.stringify({ metronome: playback.metronomeEnabled, countIn: playback.countInEnabled } satisfies Saved);
    if (value === last) return;
    last = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Not remembering the choice is fine.
    }
  });
}
