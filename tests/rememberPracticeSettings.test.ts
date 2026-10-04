// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instrument, InstrumentStatus } from '../src/application/ports/Instrument';
import type { SettingsStore } from '../src/application/ports/SettingsStore';
import { Playback } from '../src/application/use-cases/Playback';
import { rememberPracticeSettings } from '../src/application/use-cases/rememberPracticeSettings';
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

beforeEach(() => {
  playback = new Playback(new FakeAudio(), new FakeTicker());
  instrument = new FakeInstrument();
});

describe('rememberPracticeSettings', () => {
  it('leaves the defaults on a first visit, and writes nothing until a choice is made', () => {
    const before = [playback.metronomeEnabled, playback.countInEnabled, instrument.enabled];
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, store);
    expect([playback.metronomeEnabled, playback.countInEnabled, instrument.enabled]).toEqual(before);
    expect(store.saves).toEqual([]);
  });

  it('restores the choices of the last visit', () => {
    const defaults = { metronome: playback.metronomeEnabled, countIn: playback.countInEnabled };
    rememberPracticeSettings(playback, instrument, new FakeStore({ metronome: !defaults.metronome, countIn: !defaults.countIn, piano: false }));
    expect(playback.metronomeEnabled).toBe(!defaults.metronome);
    expect(playback.countInEnabled).toBe(!defaults.countIn);
    expect(instrument.enabled).toBe(false);
  });

  it('takes from the store only what is a choice: the rest keeps its default', () => {
    const metronome = playback.metronomeEnabled;
    for (const held of ['text', 42, [true], { metronome: 'yes', countIn: null, piano: 0, other: true }]) {
      rememberPracticeSettings(playback, instrument, new FakeStore(held));
      expect(playback.metronomeEnabled).toBe(metronome);
      expect(instrument.enabled).toBe(true);
    }
    // One choice of three is enough.
    rememberPracticeSettings(playback, instrument, new FakeStore({ piano: false }));
    expect(instrument.enabled).toBe(false);
    expect(playback.metronomeEnabled).toBe(metronome);
  });

  it('saves every choice as it is made, all three together', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, store);
    playback.setMetronomeEnabled(true);
    playback.setCountInEnabled(true);
    instrument.setEnabled(false);
    expect(store.saves.at(-1)).toEqual({ metronome: true, countIn: true, piano: false });
    expect(store.saves.length).toBe(3);
  });

  it('does not write again when something else changes', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, store);
    playback.setMetronomeEnabled(!playback.metronomeEnabled);
    const saves = store.saves.length;
    playback.setTempo(0.5);
    playback.setHandEnabled('left', false);
    playback.setMetronomeEnabled(playback.metronomeEnabled);
    expect(store.saves.length).toBe(saves);
  });

  it('brings a choice back on the next visit', () => {
    const store = new FakeStore();
    rememberPracticeSettings(playback, instrument, store);
    instrument.setEnabled(false);

    const nextInstrument = new FakeInstrument();
    rememberPracticeSettings(new Playback(new FakeAudio(), new FakeTicker()), nextInstrument, store);
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
