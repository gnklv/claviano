import type { Hand, Note } from '../domain/note';
import { pitch } from '../domain/pitch';
import { transcribed } from '../domain/notation/transcription';
import { createScore, type Score } from '../domain/score';

/** [pitch, beats]; pitch null is a rest. */
type Part = readonly (readonly [number | null, number])[];

const Sol2 = pitch('Sol', 2), Do3 = pitch('Do', 3), Re3 = pitch('Re', 3), Sol3 = pitch('Sol', 3);
const Do4 = pitch('Do', 4), Re4 = pitch('Re', 4), Mi4 = pitch('Mi', 4), Fa4 = pitch('Fa', 4), Sol4 = pitch('Sol', 4);

const phrase = (ending: Part): Part => [
  [Mi4, 1], [Mi4, 1], [Fa4, 1], [Sol4, 1],
  [Sol4, 1], [Fa4, 1], [Mi4, 1], [Re4, 1],
  [Do4, 1], [Do4, 1], [Re4, 1], [Mi4, 1],
  ...ending,
];

const melody: Part = [
  ...phrase([[Mi4, 1.5], [Re4, 0.5], [Re4, 2]]),
  ...phrase([[Re4, 1.5], [Do4, 0.5], [Do4, 2]]),
];

/** Root and fifth per bar: Do, Sol, Do, Sol, Do, Sol, Do, Sol→Do. */
const chord = (root: number, fifth: number, beats: number): Part => [[root, beats], [fifth, beats]];
const DoChord = chord(Do3, Sol3, 4);
const SolChord = chord(Sol2, Re3, 4);
const bass: readonly Part[] = [
  DoChord, SolChord, DoChord, SolChord, DoChord, SolChord, DoChord,
  [...chord(Sol2, Re3, 2), ...chord(Do3, Sol3, 2)],
];

/** Both clocks of a note: seconds for playback (slightly detached), beats for notation (exact). */
const timing = (beat: number, beats: number, secondsPerBeat: number) => ({
  start: beat * secondsPerBeat,
  duration: beats * secondsPerBeat * 0.95,
  beat,
  beats,
});

function sequence(part: Part, hand: Hand, secondsPerBeat: number): Note[] {
  const notes: Note[] = [];
  let beat = 0;
  for (const [midi, beats] of part) {
    if (midi !== null) {
      notes.push({ pitch: midi, ...timing(beat, beats, secondsPerBeat), velocity: 0.7, hand });
    }
    beat += beats;
  }
  return notes;
}

/** Chords are listed as pairs of notes sharing the same time slot. */
function chords(bars: readonly Part[], hand: Hand, secondsPerBeat: number): Note[] {
  const notes: Note[] = [];
  let beat = 0;
  for (const bar of bars) {
    for (let i = 0; i + 1 < bar.length; i += 2) {
      const pair = [bar[i]!, bar[i + 1]!];
      const beats = pair[0]![1];
      for (const [midi] of pair) {
        if (midi === null) continue;
        notes.push({ pitch: midi, ...timing(beat, beats, secondsPerBeat), velocity: 0.45, hand });
      }
      beat += beats;
    }
  }
  return notes;
}

/** Beethoven, "Ode to Joy" — a simple two-hand arrangement to try the player without a file. */
export function odeToJoy(title: string, bpm = 100): Score {
  const secondsPerBeat = 60 / bpm;
  const barCount = 8;
  const barBeats = Array.from({ length: barCount }, (_, i) => i * 4);
  // Given as played notes, like a MIDI file: the domain writes them down.
  return transcribed(
    createScore(
      title,
      [...sequence(melody, 'right', secondsPerBeat), ...chords(bass, 'left', secondsPerBeat)],
      barBeats.map((beat) => beat * secondsPerBeat),
      {
        barBeats,
        timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
        keySignatures: [{ beat: 0, fifths: 0, minor: false }], // Do major
      },
    ),
  );
}
