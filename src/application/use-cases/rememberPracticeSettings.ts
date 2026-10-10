import type { Instrument } from '../ports/Instrument';
import type { SettingsStore } from '../ports/SettingsStore';
import type { Playback } from './Playback';
import type { Volume } from './Volume';

/** The choices kept between visits. */
interface PracticeSettings {
  metronome: boolean;
  countIn: boolean;
  /** The sampled piano (the default), or the synth alone. */
  piano: boolean;
  /** How loud the notes and the metronome are, 0 to 1. */
  notesVolume: number;
  metronomeVolume: number;
}

/** Restores the metronome, count-in, sound and volume choices from the last visit, and keeps them saved. */
export function rememberPracticeSettings(playback: Playback, instrument: Instrument, volume: Volume, store: SettingsStore): void {
  // The store may hold anything (an older version's settings, someone else's data): each choice is taken only if it is one.
  const loaded = store.load();
  const saved: Partial<Record<keyof PracticeSettings, unknown>> = typeof loaded === 'object' && loaded !== null ? loaded : {};
  if (typeof saved.metronome === 'boolean') playback.setMetronomeEnabled(saved.metronome);
  if (typeof saved.countIn === 'boolean') playback.setCountInEnabled(saved.countIn);
  if (typeof saved.piano === 'boolean') instrument.setEnabled(saved.piano);
  if (typeof saved.notesVolume === 'number') volume.set('instrument', saved.notesVolume);
  if (typeof saved.metronomeVolume === 'number') volume.set('metronome', saved.metronomeVolume);

  const current = (): PracticeSettings => ({
    metronome: playback.metronomeEnabled,
    countIn: playback.countInEnabled,
    piano: instrument.enabled,
    notesVolume: volume.of('instrument'),
    metronomeVolume: volume.of('metronome'),
  });
  let last = '';
  const save = () => {
    const settings = current();
    // Playback tells of every change (play, pause, tempo…): only a changed choice is written.
    const value = JSON.stringify(settings);
    if (value === last) return;
    last = value;
    store.save(settings);
  };
  playback.onChange(save);
  instrument.onChange(save);
  volume.onChange(save);
}
