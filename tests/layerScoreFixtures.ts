import type { Note } from '../src/domain/note';
import type { Notation } from '../src/domain/notation/notation';
import { writtenDuration } from '../src/domain/notation/noteValue';
import { spell } from '../src/domain/notation/spelling';
import type { WrittenGrace, WrittenNote } from '../src/domain/notation/written';
import { createScore } from '../src/domain/score';

export function written(beat: number, sounding: number, more: Partial<WrittenNote> = {}): WrittenNote {
  const beats = more.beats ?? 1;
  return {
    staff: 1, voice: '1', hand: 'right', chord: false, clef: 'treble',
    pitch: spell(sounding, 0), sounding, bar: Math.floor(beat / 4), beat, beats,
    duration: writtenDuration(beats), tuplet: null, tupletStart: null, tupletStop: false,
    accidental: null, stem: null, beams: [], tieStart: false, tieStop: false,
    articulations: [], fermata: null, slurs: [], dynamics: null, ornaments: [],
    trillLine: false, tremolo: null, arpeggio: null, ...more,
  };
}

export function notation(notes: readonly WrittenNote[], more: Partial<Notation> = {}): Notation {
  const count = Math.max(1, ...notes.map((note) => note.bar + 1));
  const base = createScore('Layers', [], [], {
    written: notes, writtenBarBeats: Array.from({ length: count }, (_, i) => i * 4), writtenEndBeat: count * 4,
    tempos: [{ bar: 0, beat: 0, bpm: 60 }],
  }).notation;
  return { ...base, ...more };
}

export function grace(sounding: number, more: Partial<WrittenGrace> = {}): WrittenGrace {
  return {
    staff: 1, hand: 'right', clef: 'treble', pitch: spell(sounding, 0), sounding,
    accidental: null, chord: false, slash: true, value: 'eighth', slur: false, ...more,
  };
}

export const played = (pitch: number, start: number, beat: number, more: Partial<Note> = {}): Note => ({
  pitch, start, beat, duration: 0.23, beats: 0.47, velocity: 0.71, hand: 'right', ...more,
});
