import { describe, expect, it } from 'vitest';
import type { Hand, Note } from '../src/domain/note';
import { transcribe } from '../src/domain/notation/transcription';
import { pitch } from '../src/domain/pitch';
import { createScore } from '../src/domain/score';

/** 60 BPM, bars of 4/4: a beat is a second. `held`: how long the key was down, in beats. */
const played = (name: Parameters<typeof pitch>[0], octave: number, beat: number, held: number, hand: Hand = 'right'): Note => ({
  pitch: pitch(name, octave),
  start: beat,
  duration: held,
  beat,
  beats: held,
  velocity: 0.8,
  hand,
});
const written = (notes: Note[], bars = [0, 4]) => transcribe(createScore('played', notes, bars)).written;

describe('transcribe', () => {
  it('writes each note where it was played, named for the key, on its hand\'s staff', () => {
    const notes = written([played('Do', 4, 0, 1), played('Fa#', 4, 1, 1), played('Do', 3, 0, 2, 'left')]);
    expect(notes.map((n) => [n.staff, n.clef, n.hand, n.beat, n.pitch.letter, n.pitch.alteration, n.accidental])).toEqual([
      [2, 'bass', 'left', 0, 0, 0, null], // notes that start together: the lower one first
      [1, 'treble', 'right', 0, 0, 0, null],
      [1, 'treble', 'right', 1, 3, 1, 'sharp'],
    ]);
  });

  it('writes a note up to the next one, not as short as the key was held', () => {
    // Four quarters played staccato: written as quarters, not sixteenths.
    const notes = written([0, 1, 2, 3].map((beat) => played('Do', 4, beat, 0.25)));
    expect(notes.map((n) => [n.beats, n.duration.value])).toEqual(new Array(4).fill([1, 'quarter']));
  });

  it('joins notes of one hand that start together into a chord', () => {
    const notes = written([played('Do', 4, 0, 2), played('Mi', 4, 0, 2), played('Sol', 4, 0, 2)]);
    expect(notes.map((n) => n.chord)).toEqual([false, true, true]);
  });

  it('beams eighths within a beat, and leaves quarters alone', () => {
    const notes = written([played('Do', 4, 0, 0.5), played('Re', 4, 0.5, 0.5), played('Mi', 4, 1, 0.5), played('Fa', 4, 1.5, 0.5), played('Sol', 4, 2, 2)]);
    expect(notes.map((n) => n.beams)).toEqual([['begin'], ['end'], ['begin'], ['end'], []]);
  });

  it('writes both hands on one staff as two voices, stems apart', () => {
    // The left hand comes up to the treble staff, far above its own.
    const notes = written([played('Mi', 5, 0, 4), played('Do', 5, 0, 4, 'left')]);
    expect(notes.map((n) => [n.hand, n.staff, n.voice, n.stem])).toEqual([
      ['left', 1, '2', 'down'],
      ['right', 1, '1', 'up'],
    ]);
  });

  it('writes a run far above the staff an octave lower, under 8va', () => {
    const { written: notes, octaveShifts } = transcribe(createScore('high', [played('Do', 7, 0, 1), played('Re', 7, 1, 1), played('Do', 5, 2, 2)], [0, 4]));
    expect(notes.map((n) => n.pitch.octave)).toEqual([6, 6, 5]);
    expect(octaveShifts).toEqual([{ staff: 1, start: 0, end: 2, octaves: 1 }]);
  });
});
