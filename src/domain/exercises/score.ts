import type { Hand } from '../note';
import type { Score } from '../score';
import { groupBeams } from '../notation/beaming';
import type { Notation } from '../notation/notation';
import { writtenDuration } from '../notation/noteValue';
import { performNotation } from '../notation/performance';
import { spell } from '../notation/spelling';
import type { WrittenNote, WrittenRest } from '../notation/written';
import { exercisePattern, rest, single } from './patterns';
import { exerciseById, type ExerciseHands, type ExerciseId } from './catalog';

const BAR = 4;
const TIME = { beat: 0, numerator: 4, denominator: 4 };

/** A finite study, written first so playback follows the same articulation rules as imported music. */
export function exerciseScore(id: ExerciseId, hands: ExerciseHands): Score {
  const exercise = exerciseById(id);
  if (!exercise.hands.includes(hands))
    throw new Error(`${exercise.title} does not support ${hands} hands`);
  const playing: Hand[] = hands === 'both' ? ['right', 'left'] : [hands];
  const notes: WrittenNote[] = [];
  const rests: WrittenRest[] = [];
  let end = 0;
  for (const hand of playing) {
    const staff = hand === 'right' ? 1 : 2;
    const clef = hand === 'right' ? 'treble' : 'bass';
    const voice = String(staff);
    const base = hand === 'right' ? 60 : (id === 'scale-two-octaves' || id === 'arpeggio') ? 36 : 48;
    let beat = 0;
    const steps = exercisePattern(id, hand);
    // A full final tonic bar retains the printed duration even after detached notes and rests.
    const length = steps.reduce((sum, step) => sum + step.beats, 0);
    const finish = Math.ceil(length / BAR) * BAR;
    for (const step of [...steps, rest(finish - length), single(0, hand === 'right' ? 1 : 5, BAR)]) {
      if (step.beats === 0)
        continue;
      let remaining = step.beats;
      while (remaining > 0) {
        const beats = Math.min(remaining, BAR - beat % BAR);
        const duration = writtenDuration(beats);
        if (!step.pitches.length)
          rests.push({
            staff, voice, beat, duration, measure: beats === BAR, displayPitch: null, clef,
          });
        step.pitches.forEach((offset, index) => notes.push({
          bar: Math.floor(beat / BAR), staff, voice, hand, chord: index > 0, clef, pitch: spell(base + offset, 0), sounding: base + offset,
          beat, beats, duration, tuplet: null, tupletStart: null, tupletStop: false, accidental: null, stem: null, beams: [],
          tieStart: remaining > beats, tieStop: remaining < step.beats, articulations: step.short ? ['staccato'] : [],
          fermata: null, slurs: [], dynamics: null, ornaments: [], trillLine: false, tremolo: null, arpeggio: null,
          fingering: { text: String(step.fingers[index]), below: hand === 'left' },
        }));
        beat += beats;
        remaining -= beats;
      }
    }
    // Slur only adjacent notes belonging to a legato run, stopping before rests or a new bar.
    const line = notes.filter(n => n.hand === hand && !n.chord);
    const legato = id === 'five-notes' || id.startsWith('scale-');
    if (legato) {
      let from = 0;
      for (let i = 0; i < line.length; i++) {
        const next = line[i + 1];
        if (next && next.bar === line[i]!.bar && next.beat === line[i]!.beat + line[i]!.beats)
          continue;
        if (i > from) {
          for (const [at, type] of [[from, 'start'], [i, 'stop']] as const) {
            const index = notes.indexOf(line[at]!);
            notes[index] = { ...notes[index]!, slurs: [{ type, number: 1, placement: hand === 'right' ? 'above' : 'below' }] };
          }
        }
        from = i + 1;
      }
    }
    end = Math.max(end, beat);
  }
  const heads = notes.map((note, index) => ({ note, index })).filter(({ note }) => !note.chord);
  for (const group of groupBeams(heads.map(({ note }) => ({
    staff: String(note.staff), bar: note.bar, beat: note.beat, barBeat: note.bar * BAR, duration: note.duration, timeSignature: TIME,
  })))) {
    group.forEach((head, i) => {
      const { index } = heads[head]!;
      const beam = i === 0 ? 'begin' : i === group.length - 1 ? 'end' : 'continue';
      // Secondary beams and hooks follow the note values, as in transcription.
      notes[index] = { ...notes[index]!, beams: [beam] };
    });
  }
  const notation: Notation = {
    title: `${exercise.title} · C major`, bars: Array.from({ length: end / BAR }, (_, i) => ({ start: i * BAR, length: BAR, navigation: {} })),
    notes, rests, graces: [], clefs: playing.map(hand => ({ staff: hand === 'right' ? 1 : 2, beat: 0, clef: hand === 'right' ? 'treble' : 'bass' })),
    keySignatures: [{ beat: 0, fifths: 0, minor: false }], timeSignatures: [TIME], tempos: [{ bar: 0, beat: 0, bpm: exercise.tempo }],
    tempoMarks: [{ beat: 0, unit: writtenDuration(1), perMinute: exercise.tempo, printed: true }],
    pedalMoves: [], pedalMarks: [],
    octaveShifts: [], dynamics: [], hairpins: [], dynamicLevels: [], words: [],
  };
  return { ...performNotation(notation), notation };
}
