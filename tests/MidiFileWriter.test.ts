import { describe, expect, it } from 'vitest';
import { scoreFromTake } from '../src/domain/notation/recording';
import { MidiFileParser } from '../src/infrastructure/parsers/MidiFileParser';
import { MidiFileWriter } from '../src/infrastructure/writers/MidiFileWriter';

/* A piece written out as a MIDI file, and read back by the reader: the same piece. */

const writer = new MidiFileWriter();
const reader = new MidiFileParser();
const take = (tempo: number, numerator: number, denominator: number, beat: number, notes: [number, number, number][]) =>
  scoreFromTake(
    'A take',
    notes.map(([pitch, start, end]) => ({ pitch, start, end })),
    { tempo, numerator, denominator, beat },
    0,
  );

describe('the MIDI writer', () => {
  it('writes a Standard MIDI File: a header, and three tracks (the beat, the right hand, the left)', () => {
    const bytes = new Uint8Array(writer.write(take(60, 4, 4, 1, [[60, 0, 1]])));
    const text = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
    expect(text(0)).toBe('MThd');
    // Format 1, three tracks, 480 ticks to the quarter.
    expect([...bytes.subarray(8, 14)]).toEqual([0, 1, 0, 3, 1, 0xe0]);
    expect(text(14)).toBe('MTrk');
    expect(writer.extension).toBe('.mid');
  });

  it('is read back as the same piece: the notes on their beats, the hands, the tempo, the time signature, the bars', () => {
    const written = take(90, 3, 4, 1, [
      [48, 0, 0.6],
      [64, 0, 0.3],
      [67, 0.34, 0.66],
      [72, 2, 3.9],
      [45, 2, 3.9],
    ]);
    const read = reader.parse(writer.write(written), 'A take');
    const told = (score: typeof written) => score.notes.map((note) => [note.pitch, note.beat, note.hand]);
    expect(told(read)).toEqual(told(written));
    read.notes.forEach((note, index) => {
      expect(note.start).toBeCloseTo(written.notes[index].start, 3);
      expect(note.beats).toBeCloseTo(written.notes[index].beats, 1);
    });
    expect(read.notation.timeSignatures).toEqual(written.notation.timeSignatures);
    expect(read.notation.tempoMarks[0]?.perMinute).toBe(90);
    expect(read.bars).toHaveLength(written.bars.length);
    read.bars.forEach((bar, index) => expect(bar).toBeCloseTo(written.bars[index], 3));
  });

  it('keeps a key struck again where it ended as two notes', () => {
    const read = reader.parse(writer.write(take(60, 4, 4, 1, [[60, 0, 1], [60, 1, 2]])), 'Twice');
    expect(read.notes.map((note) => note.beat)).toEqual([0, 1]);
  });

  it('keeps the hands of a piece played with one hand alone', () => {
    const low = reader.parse(writer.write(take(60, 4, 4, 1, [[40, 0, 1], [43, 1, 2]])), 'Low');
    expect(low.notes.map((note) => note.hand)).toEqual(['left', 'left']);
  });

  it('writes 6/8, and a tempo in dotted quarters as quarters to the minute', () => {
    const read = reader.parse(writer.write(take(60, 6, 8, 1.5, [[60, 0, 0.5], [62, 2, 2.5]])), 'Jig');
    expect(read.notation.timeSignatures).toEqual([{ beat: 0, numerator: 6, denominator: 8 }]);
    expect(read.notation.tempoMarks[0]?.perMinute).toBe(90);
    expect(read.notes.map((note) => note.beat)).toEqual([0, 3]);
  });
});
