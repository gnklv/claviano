import type { Instrument } from '../../application/ports/Instrument';
import type { Playback } from '../../application/use-cases/Playback';

const STORAGE_KEY = 'claviano.practice';

interface Saved {
  metronome?: boolean;
  countIn?: boolean;
  /** The sampled piano (the default), or the synth alone. */
  piano?: boolean;
}

/** Restores the metronome, count-in and sound choices from the last visit, and keeps them saved. */
export function rememberPracticeSettings(playback: Playback, instrument: Instrument): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved;
    if (typeof saved.metronome === 'boolean') playback.setMetronomeEnabled(saved.metronome);
    if (typeof saved.countIn === 'boolean') playback.setCountInEnabled(saved.countIn);
    if (typeof saved.piano === 'boolean') instrument.setEnabled(saved.piano);
  } catch {
    // Storage can be unavailable or hold something else; the defaults are fine.
  }

  let last = '';
  const save = () => {
    const value = JSON.stringify({
      metronome: playback.metronomeEnabled,
      countIn: playback.countInEnabled,
      piano: instrument.enabled,
    } satisfies Saved);
    if (value === last) return;
    last = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Not remembering the choice is fine.
    }
  };
  playback.onChange(save);
  instrument.onChange(save);
}
