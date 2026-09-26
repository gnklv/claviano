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

  it('builds bars from the time signature', () => {
    const file = midiFile(480, [
      track([tempo(120), timeSignature(3, 2), [0, 0x90, 60, 100], [480 * 9, 0x80, 60, 0]]),
    ]);
    const score = parser.parse(file, 'test');
    expect(score.bars).toEqual([0, 1.5, 3]);
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
