import { describe, expect, it } from 'vitest';
import { InvalidMidiError, MidiFileParser } from '../src/infrastructure/parsers/MidiFileParser';

// --- A tiny MIDI writer, just enough to build test files by hand. ---

const vlq = (value: number): number[] => {
  const bytes = [value & 0x7f];
  while ((value >>= 7) > 0) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
};
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

type Event = [delta: number, ...bytes: number[]];

const track = (events: Event[]): number[] => {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]);
  body.push(0, 0xff, 0x2f, 0); // end of track
  return [...ascii('MTrk'), ...u32(body.length), ...body];
};

const midiFile = (ticksPerQuarter: number, tracks: number[][]): ArrayBuffer =>
  new Uint8Array([
    ...ascii('MThd'),
    ...u32(6),
    ...u16(tracks.length > 1 ? 1 : 0),
    ...u16(tracks.length),
    ...u16(ticksPerQuarter),
    ...tracks.flat(),
  ]).buffer;

const tempo = (bpm: number): Event => {
  const us = Math.round(60_000_000 / bpm);
  return [0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
};
const timeSignature = (numerator: number, denominatorPower: number): Event =>
  [0, 0xff, 0x58, 4, numerator, denominatorPower, 24, 8];

/** Key signature meta event: sharps (+) or flats (−), and major/minor. */
const keySignature = (delta: number, fifths: number, minor = false): Event =>
  [delta, 0xff, 0x59, 2, fifths & 0xff, minor ? 1 : 0];

/** Sustain pedal (controller 64) on channel 1: down or up. */
const pedal = (delta: number, down: boolean): Event => [delta, 0xb0, 64, down ? 127 : 0];

const parser = new MidiFileParser();

describe('MidiFileParser', () => {
  it('recognises .mid and .midi files', () => {
    expect(parser.canParse('song.mid')).toBe(true);
    expect(parser.canParse('SONG.MIDI')).toBe(true);
    expect(parser.canParse('song.xml')).toBe(false);
  });

  it('converts ticks to seconds using the tempo', () => {
    const file = midiFile(480, [
      track([
        tempo(120),
        [0, 0x90, 60, 100],
        [480, 0x80, 60, 0],
        [0, 0x90, 64, 64],
        [480, 0x80, 64, 0],
      ]),
    ]);
    const score = parser.parse(file, 'test');
    expect(score.notes).toHaveLength(2);
    expect(score.notes[0]).toMatchObject({ pitch: 60, start: 0, duration: 0.5 });
    expect(score.notes[0].velocity).toBeCloseTo(100 / 127);
    expect(score.notes[1]).toMatchObject({ pitch: 64, start: 0.5, duration: 0.5 });
  });

  it('handles running status and note-on with zero velocity', () => {
    const file = midiFile(96, [
      track([
        [0, 0x90, 60, 80],
        [96, 60, 0], // running status, velocity 0 = note off
        [0, 62, 80],
        [96, 62, 0],
      ]),
    ]);
    const score = parser.parse(file, 'test');
    expect(score.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
    ]);
  });

  it('skips stray system messages without losing running status', () => {
    const file = midiFile(96, [
      track([
        [0, 0x90, 60, 80],
        [0, 0xf8], // timing clock: no data
        [0, 0xf2, 0x10, 0x20], // song position: two data bytes
        [0, 0xf3, 5], // song select: one
        [96, 60, 0], // still note-on running status
        [0, 62, 80],
        [96, 62, 0],
      ]),
    ]);
    const score = parser.parse(file, 'test');
    expect(score.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
    ]);
  });

  it('applies tempo changes in the middle of the piece', () => {
    const file = midiFile(480, [
      track([
        tempo(120),
        [0, 0x90, 60, 100],
        [480, 0x80, 60, 0],
        [0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40], // 1_000_000 us per quarter = 60 BPM
        [0, 0x90, 62, 100],
        [480, 0x80, 62, 0],
      ]),
    ]);
    const [first, second] = parser.parse(file, 'test').notes;
    expect(first.duration).toBeCloseTo(0.5);
    expect(second.start).toBeCloseTo(0.5);
    expect(second.duration).toBeCloseTo(1);
  });

  it('prints tempo changes that hold for a bar, not the wobble of live playing', () => {
    const at = (delta: number, bpm: number): Event => [delta, ...tempo(bpm).slice(1)] as Event;
    const file = midiFile(480, [
      track([
        tempo(100),
        at(480 * 4, 101), // bar 2: a wobble for one beat…
        at(480, 100.2), // …back to 100 (rounds the same: nothing new to print)
        at(480 * 3, 72), // bar 3: a real change, held to the end
        [0, 0x90, 60, 100],
        [480 * 8, 0x80, 60, 0],
      ]),
    ]);
    expect(parser.parse(file, 'test').tempoMarks.map((m) => [m.beat, m.perMinute])).toEqual([
      [0, 100],
      [8, 72],
    ]);
  });

  it('builds bars from the time signature', () => {
    const file = midiFile(480, [
      track([tempo(120), timeSignature(3, 2), [0, 0x90, 60, 100], [480 * 9, 0x80, 60, 0]]),
    ]);
    const score = parser.parse(file, 'test');
    expect(score.bars).toEqual([0, 1.5, 3]);
    expect(score.barBeats).toEqual([0, 3, 6]);
  });

  it('gives notes their musical time in quarter notes', () => {
    const file = midiFile(480, [
      track([
        tempo(90), // tempo must not matter for beats
        [0, 0x90, 60, 100],
        [240, 0x80, 60, 0], // an eighth
        [0, 0x90, 62, 100],
        [720, 0x80, 62, 0], // a dotted quarter
      ]),
    ]);
    const [eighth, dottedQuarter] = parser.parse(file, 'test').notes;
    expect(eighth).toMatchObject({ beat: 0, beats: 0.5 });
    expect(dottedQuarter).toMatchObject({ beat: 0.5, beats: 1.5 });
  });

  it('reads time signatures with their position in beats', () => {
    const file = midiFile(480, [
      track([
        timeSignature(3, 3), // 3/8
        [0, 0x90, 60, 100],
        [480 * 6, 0x80, 60, 0],
      ]),
    ]);
    expect(parser.parse(file, 'test').timeSignatures).toEqual([{ beat: 0, numerator: 3, denominator: 8 }]);
  });

  it('reads key signatures: sharps, flats and changes during the piece', () => {
    const file = midiFile(480, [
      track([
        keySignature(0, 3), // La major: three sharps
        [0, 0x90, 60, 100],
        [480 * 4, 0x80, 60, 0],
        keySignature(0, -2, true), // Sol minor: two flats, from beat 4
        [0, 0x90, 62, 100],
        [480, 0x80, 62, 0],
      ]),
    ]);
    expect(parser.parse(file, 'test').keySignatures).toEqual([
      { beat: 0, fifths: 3, minor: false },
      { beat: 4, fifths: -2, minor: true },
    ]);
  });

  it('defaults to 4/4 in Do major when the file says nothing', () => {
    const score = parser.parse(midiFile(480, [track([[0, 0x90, 60, 100], [480, 0x80, 60, 0]])]), 'test');
    expect(score.timeSignatures).toEqual([{ beat: 0, numerator: 4, denominator: 4 }]);
    expect(score.keySignatures).toEqual([{ beat: 0, fifths: 0, minor: false }]);
  });

  it('assigns hands by track, the higher track being the right hand', () => {
    const file = midiFile(480, [
      track([tempo(120)]),
      track([[0, 0x90, 40, 100], [480, 0x80, 40, 0]]),
      track([[0, 0x90, 72, 100], [480, 0x80, 72, 0]]),
    ]);
    const hands = Object.fromEntries(parser.parse(file, 'test').notes.map((n) => [n.pitch, n.hand]));
    expect(hands).toEqual({ 40: 'left', 72: 'right' });
  });

  it('splits a single track by pitch', () => {
    const file = midiFile(480, [
      track([[0, 0x90, 48, 100], [0, 0x90, 67, 100], [480, 0x80, 48, 0], [0, 0x80, 67, 0]]),
    ]);
    const hands = Object.fromEntries(parser.parse(file, 'test').notes.map((n) => [n.pitch, n.hand]));
    expect(hands).toEqual({ 48: 'left', 67: 'right' });
  });

  it('ignores the drum channel', () => {
    const file = midiFile(480, [track([[0, 0x99, 36, 100], [480, 0x89, 36, 0]])]);
    expect(parser.parse(file, 'test').notes).toHaveLength(0);
  });

  describe('pedals', () => {
    it('reads controller 64 as pedal spans in seconds', () => {
      const file = midiFile(480, [
        track([tempo(120), pedal(0, true), [0, 0x90, 48, 100], [480, 0x80, 48, 0], pedal(480, false), [480, 0x90, 50, 100], [480, 0x80, 50, 0]]),
      ]);
      const score = parser.parse(file, 'test');
      expect(score.pedal).toEqual([{ start: 0, end: 1 }]);
      // The note keeps the length of the key; the pedal lives beside it.
      expect(score.notes[0].duration).toBe(0.5);
    });

    it('treats values from 64 up as down and merges copies from several tracks', () => {
      const file = midiFile(480, [
        track([tempo(120), [0, 0xb0, 64, 100], [480, 0xb0, 64, 20]]),
        track([pedal(0, true), [0, 0x90, 60, 100], [960, 0x80, 60, 0], pedal(0, false)]),
      ]);
      expect(parser.parse(file, 'test').pedal).toEqual([{ start: 0, end: 1 }]);
    });

    it('draws the pedal as a bracket, a quick lift and press being a change', () => {
      const file = midiFile(480, [
        track([
          pedal(0, true),
          [0, 0x90, 60, 100],
          pedal(960, false), // at beat 2…
          pedal(60, true), // …pressed again an eighth of a beat later: a change
          [0, 0x80, 60, 0],
          pedal(960, false), // a real release: up for a whole beat
          [0, 0x90, 62, 100],
          pedal(480, true),
          [480, 0x80, 62, 0],
          pedal(0, false),
        ]),
      ]);
      const marks = parser.parse(file, 'test').pedalMarks;
      expect(marks.map((m) => [m.type, m.beat])).toEqual([
        ['start', 0],
        ['change', 2],
        ['stop', 4.125],
        ['start', 5.125],
        ['stop', 6.125],
      ]);
      expect(marks.every((m) => m.line && !m.sign)).toBe(true);
    });

    it('reads the middle (66) and left (67) pedals, and marks them for the staff', () => {
      const cc = (delta: number, controller: number, down: boolean): Event => [delta, 0xb0, controller, down ? 127 : 0];
      const file = midiFile(480, [
        track([tempo(120), cc(0, 67, true), [0, 0x90, 36, 100], cc(0, 66, true), [480, 0x80, 36, 0], cc(480, 66, false), cc(0, 67, false)]),
      ]);
      const score = parser.parse(file, 'test');
      expect(score.sostenutoPedal).toEqual([{ start: 0, end: 1 }]);
      expect(score.softPedal).toEqual([{ start: 0, end: 1 }]);
      expect(score.pedal).toEqual([]);
      expect(score.pedalMarks.map((m) => [m.pedal, m.type, m.text])).toEqual([
        ['sostenuto', 'start', undefined],
        ['soft', 'start', 'una corda'],
        ['sostenuto', 'stop', undefined],
        ['soft', 'stop', 'tre corde'],
      ]);
    });

    it('ignores the pedal of the drum channel', () => {
      const file = midiFile(480, [track([[0, 0xb9, 64, 127], [0, 0x90, 60, 100], [480, 0x80, 60, 0], [0, 0xb9, 64, 0]])]);
      expect(parser.parse(file, 'test').pedal).toEqual([]);
    });
  });

  it('rejects files that are not MIDI', () => {
    const parse = () => parser.parse(new Uint8Array(ascii('hello, world!!')).buffer, 'x');
    expect(parse).toThrow(InvalidMidiError);
    expect(parse).toThrow(expect.objectContaining({ code: 'invalid-file' }));
  });

  it('reports SMPTE timing as an unsupported feature', () => {
    const smpte = new Uint8Array(midiFile(480, [track([])]));
    smpte[12] = 0xe7; // division with the high bit set = SMPTE frames
    expect(() => parser.parse(smpte.buffer, 'x')).toThrow(expect.objectContaining({ code: 'unsupported-feature' }));
  });
});
