// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instrument, InstrumentStatus } from '../src/application/ports/Instrument';
import type { SettingsStore } from '../src/application/ports/SettingsStore';
import { Playback } from '../src/application/use-cases/Playback';
import { rememberPracticeSettings } from '../src/application/use-cases/rememberPracticeSettings';
import { Volume } from '../src/application/use-cases/Volume';
import { LocalSettingsStore } from '../src/infrastructure/storage/LocalSettingsStore';
import { FakeAudio, FakeTicker } from './fakes';

/* The choices kept between visits: the metronome, the count-in and the piano's sound. */

class FakeStore implements SettingsStore {
  saves: unknown[] = [];
  constructor(private held: unknown = null) {}
  load = () => this.held;
  save = (settings: unknown) => {
    this.held = settings;
    this.saves.push(settings);
  };
}

class FakeInstrument implements Instrument {
  enabled = true;
  status: InstrumentStatus = 'ready';
  private readonly listeners = new Set<() => void>();
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const listener of this.listeners) listener();
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  prepare(): void {}
}

let playback: Playback;
let instrument: FakeInstrument;
let volume: Volume;
let audio: FakeAudio;

beforeEach(() => {
  audio = new FakeAudio();
  playback = new Playback(audio, new FakeTicker());
  instrument = new FakeInstrument();
  volume = new Volume(audio);
});

describe('rememberPracticeSettings', () => {
  it('leaves the defaults on a first visit, and writes nothing until a choice is made', () => {
    const before = [playback.metronomeEnabled, playback.countInEnabled, instrument.enabled];
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, volume, store);
    expect([playback.metronomeEnabled, playback.countInEnabled, instrument.enabled]).toEqual(before);
    expect(store.saves).toEqual([]);
  });

  it('restores the choices of the last visit', () => {
    const defaults = { metronome: playback.metronomeEnabled, countIn: playback.countInEnabled };
    rememberPracticeSettings(playback, instrument, volume, new FakeStore({ metronome: !defaults.metronome, countIn: !defaults.countIn, piano: false }));
    expect(playback.metronomeEnabled).toBe(!defaults.metronome);
    expect(playback.countInEnabled).toBe(!defaults.countIn);
    expect(instrument.enabled).toBe(false);
  });

  it('takes from the store only what is a choice: the rest keeps its default', () => {
    const metronome = playback.metronomeEnabled;
    for (const held of ['text', 42, [true], { metronome: 'yes', countIn: null, piano: 0, other: true }]) {
      rememberPracticeSettings(playback, instrument, volume, new FakeStore(held));
      expect(playback.metronomeEnabled).toBe(metronome);
      expect(instrument.enabled).toBe(true);
    }
    // One choice of three is enough.
    rememberPracticeSettings(playback, instrument, volume, new FakeStore({ piano: false }));
    expect(instrument.enabled).toBe(false);
    expect(playback.metronomeEnabled).toBe(metronome);
  });

  it('saves every choice as it is made, all three together', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, volume, store);
    playback.setMetronomeEnabled(true);
    playback.setCountInEnabled(true);
    instrument.setEnabled(false);
    expect(store.saves.at(-1)).toEqual({ metronome: true, countIn: true, piano: false, notesVolume: 1, metronomeVolume: 1 });
    expect(store.saves.length).toBe(3);
  });

  it('does not write again when something else changes', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, volume, store);
    playback.setMetronomeEnabled(!playback.metronomeEnabled);
    const saves = store.saves.length;
    playback.setTempo(0.5);
    playback.setHandEnabled('left', false);
    playback.setMetronomeEnabled(playback.metronomeEnabled);
    expect(store.saves.length).toBe(saves);
  });

  it('remembers how loud the notes and the metronome are, and sets the sound to it on the next visit', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, volume, store);
    volume.set('instrument', 0.6);
    volume.set('metronome', 0.3);
    expect(store.saves.at(-1)).toMatchObject({ notesVolume: 0.6, metronomeVolume: 0.3 });

    const nextAudio = new FakeAudio();
    const nextVolume = new Volume(nextAudio);
    rememberPracticeSettings(new Playback(nextAudio, new FakeTicker()), new FakeInstrument(), nextVolume, store);
    expect([nextVolume.of('instrument'), nextVolume.of('metronome')]).toEqual([0.6, 0.3]);
    expect(nextAudio.volumes).toEqual({ instrument: 0.6, metronome: 0.3 });
  });

  it('takes a volume from the store only if it is a number, and never one out of range', () => {
    rememberPracticeSettings(playback, instrument, volume, new FakeStore({ notesVolume: 'loud', metronomeVolume: 7 }));
    expect([volume.of('instrument'), volume.of('metronome')]).toEqual([1, 1]);
  });

  it('brings a choice back on the next visit', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, volume, store);
    instrument.setEnabled(false);

    const nextInstrument = new FakeInstrument();
    const nextVolume = new Volume(new FakeAudio());
    rememberPracticeSettings(new Playback(new FakeAudio(), new FakeTicker()), nextInstrument, nextVolume, store);
    expect(nextInstrument.enabled).toBe(false);
  });
});

describe('LocalSettingsStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('has nothing on a first visit', () => {
    expect(new LocalSettingsStore('test.settings').load()).toBeNull();
  });

  it('keeps what it is given under its key, and gives it back', () => {
    const store = new LocalSettingsStore('test.settings');
    store.save({ metronome: true });
    expect(new LocalSettingsStore('test.settings').load()).toEqual({ metronome: true });
    expect(localStorage.getItem('test.settings')).toBe('{"metronome":true}');
    expect(new LocalSettingsStore('other.settings').load()).toBeNull();
  });

  it('has nothing when what is under its key is not its own', () => {
    localStorage.setItem('test.settings', 'not json {');
    expect(new LocalSettingsStore('test.settings').load()).toBeNull();
  });

  it('goes on without the browser’s storage', () => {
    const reading = vi.fn(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const writing = vi.fn(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', { getItem: reading, setItem: writing });
    const store = new LocalSettingsStore('test.settings');
    expect(store.load()).toBeNull();
    expect(() => store.save({ metronome: true })).not.toThrow();
    expect(reading).toHaveBeenCalled();
    expect(writing).toHaveBeenCalled();
  });
});
