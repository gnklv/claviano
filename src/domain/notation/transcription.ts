import { beatsOf } from '../metronome';
import { noteEnd, type Hand } from '../note';
import { barAtBeat, barLengthInBeats, keySignatureAt, timeSignatureAt, type OctaveShift, type Score } from '../score';
import { groupBeams } from './beaming';
import { writtenDuration, type WrittenDuration } from './noteValue';
import { quantize } from './quantize';
import { barAccidentals, spell, type Accidental, type SpelledPitch } from './spelling';
import { BOTTOM_LINE_STEP, staffFor, staffStep } from './staffPosition';
import type { BeamMark, Clef, WrittenNote } from './written';

/*
 * Writing down what was played: from the notes of a performance (a MIDI file) to notation, the
 * way a musician would take it down by ear.
 *
 * - Each note goes on the nearest place of a 1/32 grid, and is named for the key (Fa♯ or Sol♭).
 * - It is written as long as it takes to the next note, not as long as the key was held.
 * - The right hand is written on the upper staff and the left on the lower, unless a note is far
 *   outside its staff; both hands on one staff are two voices, stems apart.
 * - Runs far above or below the staves go under 8va / 8vb.
 * - Accidentals follow the rules of the bar; eighths and shorter are beamed by the beat.
 *
 * Not written: ties, rests, tuplets, dynamics, slurs. A performance does not say them.
 */

/** A note being written down. */
interface Placed {
  readonly staff: Clef;
  readonly hand: Hand;
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly pitch: number;
  readonly spelled: SpelledPitch;
  readonly duration: WrittenDuration;
  readonly start: number;
  readonly end: number;
  accidental: Accidental | null;
}

/** Each hand's voice on each staff, numbered as notation programs do: 1–4 above, 5–8 below. */
const VOICES: Record<Clef, Record<Hand, string>> = { treble: { right: '1', left: '2' }, bass: { right: '5', left: '6' } };

/** The notation of a score that only has its played notes: the notes as written, and the octave shifts they stand under. */
export function transcribe(score: Score): { written: WrittenNote[]; octaveShifts: OctaveShift[] } {
  const sounding: Placed[] = score.notes.map((note) => {
    const { beat, beats } = quantize(note.beat, note.beats);
    const spelled = spell(note.pitch, keySignatureAt(score, beat).fifths);
    return {
      staff: staffFor(note.hand, spelled),
      hand: note.hand,
      bar: barAtBeat(score, beat),
      beat,
      beats,
      pitch: note.pitch,
      spelled,
      duration: writtenDuration(beats),
      start: note.start,
      end: noteEnd(note),
      accidental: null,
    };
  });
  const { placed, shifts } = shiftExtremes(writtenLengths(score, sounding));

  // Accidentals follow the rules per bar and per staff, in time order.
  for (const group of groupBy(placed, (p) => `${p.staff}|${p.bar}`).values()) {
    group.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
    const fifths = keySignatureAt(score, score.writtenBarBeats[group[0].bar]).fifths;
    barAccidentals(group.map((p) => p.spelled), fifths).forEach((accidental, i) => (group[i].accidental = accidental));
  }

  // Where both hands meet on one staff within a bar, they are written as two voices:
  // right hand stems up, left hand stems down, never sharing a stem or a beam.
  const handsInBar = new Map<string, Set<Hand>>();
  for (const p of placed) {
    const key = `${p.staff}|${p.bar}`;
    handsInBar.set(key, (handsInBar.get(key) ?? new Set<Hand>()).add(p.hand));
  }
  const stemOf = (p: Placed): 'up' | 'down' | null =>
    (handsInBar.get(`${p.staff}|${p.bar}`)?.size ?? 0) > 1 ? (p.hand === 'right' ? 'up' : 'down') : null;

  // Notes of one hand that start together and have the same value share a stem: a chord.
  const chords = [...groupBy(placed, (p) => `${p.staff}|${p.hand}|${p.beat}|${p.duration.value}|${p.duration.dots}`).values()];
  const start = (chord: Placed[]) => Math.min(...chord.map((p) => p.start));
  chords.sort((a, b) => a[0].beat - b[0].beat || start(a) - start(b));

  // Beams: groups of flagged chords of one hand on one staff, within a beat.
  const beamMarks = new Map<number, BeamMark>();
  const groups = groupBeams(
    chords.map(([first]) => ({
      staff: `${first.staff}|${first.hand}`,
      bar: first.bar,
      beat: first.beat,
      barBeat: score.writtenBarBeats[first.bar],
      duration: first.duration,
      timeSignature: timeSignatureAt(score, first.beat),
    })),
  );
  for (const group of groups) {
    const inOrder = [...group].sort((a, b) => chords[a][0].beat - chords[b][0].beat);
    inOrder.forEach((index, i) => beamMarks.set(index, i === 0 ? 'begin' : i === inOrder.length - 1 ? 'end' : 'continue'));
  }

  const written = chords.flatMap((chord, index) =>
    chord.map((p, i): WrittenNote => {
      const beam = i === 0 ? beamMarks.get(index) : undefined;
      return {
        staff: p.staff === 'treble' ? 1 : 2,
        voice: VOICES[p.staff][p.hand],
        hand: p.hand,
        chord: i > 0,
        clef: p.staff,
        pitch: p.spelled,
        beat: p.beat,
        beats: p.beats,
        start: p.start,
        end: p.end,
        duration: p.duration,
        tuplet: null,
        tupletStart: null,
        tupletStop: false,
        accidental: p.accidental,
        stem: stemOf(p),
        beams: beam ? [beam] : [],
        tieStart: false,
        tieStop: false,
        articulations: [],
        fermata: null,
        slurs: [],
        ornaments: [],
        trillLine: false,
        tremolo: null,
        arpeggio: null,
      };
    }),
  );
  return { written, octaveShifts: shifts };
}

/**
 * For MIDI: how long to write each note. A key is often let go well before the next note (staccato,
 * or just a light touch), and writing what was held would turn a row of quarters into sixteenths.
 * So a note is written up to the next note played (by either hand: the other hand often carries the
 * rhythm in between, as in Bach's C major prelude); with none later in the bar, up to the end of
 * the beat it sounds in (rests are not written, so no long values are invented). A note held
 * longer than that, like a bass under a melody, keeps its length. Never past the bar line.
 */
function writtenLengths(score: Score, placed: Placed[]): Placed[] {
  const onsets = [...new Set(placed.map((p) => p.beat))].sort((a, b) => a - b);
  const nextOnset = (beat: number): number | undefined => {
    let lo = 0;
    let hi = onsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (onsets[mid] <= beat + 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return onsets[lo];
  };

  return placed.map((p) => {
    const barStart = score.writtenBarBeats[p.bar];
    const barEnd = score.writtenBarBeats[p.bar + 1] ?? barStart + barLengthInBeats(timeSignatureAt(score, barStart));
    const next = nextOnset(p.beat);
    const { length } = beatsOf(timeSignatureAt(score, p.beat));
    const endOfBeat = barStart + Math.ceil((p.beat + p.beats - barStart) / length - 1e-9) * length;
    const until = next !== undefined && next <= barEnd + 1e-9 ? next : endOfBeat;
    const end = Math.min(barEnd, Math.max(p.beat + p.beats, until));
    const beats = end - p.beat;
    return beats === p.beats ? p : { ...p, beats, duration: writtenDuration(beats) };
  });
}

/** More ledger lines than this above the treble staff or below the bass staff, and MIDI notes go under 8va / 8vb. */
const MAX_LEDGER_LINES_BEFORE_SHIFT = 3;

/**
 * For MIDI: runs of notes far above the treble staff (or below the bass staff) are written an
 * octave (or two) nearer under an 8va (8vb) bracket, rather than on a ladder of ledger lines.
 * A run is the notes, in time order on one staff, that go that far; the first one that does not
 * ends it. Notes starting together are shifted together.
 */
function shiftExtremes(placed: Placed[]): {
  placed: Placed[];
  shifts: OctaveShift[];
} {
  const shifts: OctaveShift[] = [];
  const result = [...placed];
  const limit = 2 * MAX_LEDGER_LINES_BEFORE_SHIFT + 2; // steps beyond the outer line
  // How far past the limit a note is (in steps, > 0 means too far), on its own staff's outer side.
  const beyond = (p: Placed) =>
    p.staff === 'treble' ? -limit - staffStep(p.spelled, 'treble') : staffStep(p.spelled, 'bass') - BOTTOM_LINE_STEP - limit;

  for (const staff of ['treble', 'bass'] as const) {
    const onStaff = result.map((p, index) => ({ p, index })).filter(({ p }) => p.staff === staff);
    const byBeat = [...groupBy(onStaff, ({ p }) => String(p.beat)).values()].sort((a, b) => a[0].p.beat - b[0].p.beat);

    let run: { index: number; p: Placed }[] = [];
    const close = () => {
      if (run.length === 0) return;
      // One octave, or two when one still leaves the notes too far out.
      const farthest = Math.max(...run.map(({ p }) => beyond(p)));
      const octaves = farthest >= 7 ? 2 : 1;
      const signed = staff === 'treble' ? octaves : -octaves;
      for (const { index, p } of run) {
        result[index] = { ...p, spelled: { ...p.spelled, octave: p.spelled.octave - signed } };
      }
      shifts.push({
        staff: staff === 'treble' ? 1 : 2,
        start: Math.min(...run.map(({ p }) => p.beat)),
        end: Math.max(...run.map(({ p }) => p.beat + p.beats)),
        octaves: signed,
      });
      run = [];
    };
    for (const notes of byBeat) {
      if (notes.some(({ p }) => beyond(p) >= 0)) run.push(...notes);
      else close();
    }
    close();
  }
  return { placed: result, shifts };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
