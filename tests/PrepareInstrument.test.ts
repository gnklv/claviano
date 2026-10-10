import { describe, expect, it } from 'vitest';
import type { AudioOutput } from '../src/application/ports/AudioOutput';
import type { Instrument, NoteToPrepare } from '../src/application/ports/Instrument';
import { Playback } from '../src/application/use-cases/Playback';
import { keepInstrumentPrepared, notesToPrepare } from '../src/application/use-cases/PrepareInstrument';
import type { Note } from '../src/domain/note';
import { SOFT_PEDAL_LOUDNESS } from '../src/domain/pedal';
import { createScore } from '../src/domain/score';

/** At 60 BPM a beat lasts one second. */
const note = (pitch: number, start: number, duration: number, velocity = 0.5): Note => ({
  pitch,
  start,
  duration,
  beat: start,
  beats: duration,
  velocity,
  hand: 'right',
});

describe('notesToPrepare', () => {
  it('tells how hard each note is struck and how long it sounds', () => {
    const score = createScore('plain', [note(60, 0, 1, 0.3), note(64, 1, 2, 0.9)], [0]);
    expect(notesToPrepare(score, 1)).toEqual([
      { pitch: 60, velocity: 0.3, seconds: 1 },
      { pitch: 64, velocity: 0.9, seconds: 2 },
    ]);
  });

  it('counts the pedal: a note held by it sounds until the pedal comes up', () => {
    const score = createScore('pedalled', [note(48, 0, 0.5), note(64, 1, 0.5)], [0], { pedal: [{ start: 0, end: 4 }] });
    expect(notesToPrepare(score, 1).map((n) => n.seconds)).toEqual([4, 3]);
  });

  it('counts the tempo: at half speed every note lasts twice as long', () => {
    const score = createScore('slow', [note(60, 0, 1.5)], [0]);
    expect(notesToPrepare(score, 0.5)[0].seconds).toBe(3);
  });

  it('strikes notes under the soft pedal softer, as Playback plays them', () => {
    const score = createScore('soft', [note(60, 0, 1, 0.8), note(62, 2, 1, 0.8)], [0], { softPedal: [{ start: 0, end: 1 }] });
    expect(notesToPrepare(score, 1).map((n) => n.velocity)).toEqual([0.8 * SOFT_PEDAL_LOUDNESS, 0.8]);
  });
});

describe('keepInstrumentPrepared', () => {
  const audio: AudioOutput = { now: () => 0, resume: async () => {}, playNote() {}, playPedal() {}, playClick() {}, setVolume() {}, stopAll() {} };
  const setup = () => {
    const prepared: (readonly NoteToPrepare[])[] = [];
    const instrument: Instrument = { enabled: true, setEnabled() {}, status: 'ready', onChange: () => () => {}, prepare: (notes) => void prepared.push(notes) };
    const playback = new Playback(audio, { start: () => () => {} });
    keepInstrumentPrepared(playback, instrument);
    return { playback, prepared };
  };
  const score = createScore('piece', [note(60, 0, 2)], [0]);

  it('prepares the instrument when a piece is opened, and again when the tempo changes', () => {
    const { playback, prepared } = setup();
    playback.load(score);
    expect(prepared).toEqual([[{ pitch: 60, velocity: 0.5, seconds: 2 }]]);
    playback.setTempo(0.5);
    expect(prepared[1]).toEqual([{ pitch: 60, velocity: 0.5, seconds: 4 }]);
  });

  it('does not prepare again for changes that are neither the piece nor the tempo', () => {
    const { playback, prepared } = setup();
    playback.load(score);
    playback.setMetronomeEnabled(true);
    playback.setHandEnabled('left', false);
    expect(prepared).toHaveLength(1);
  });
});
