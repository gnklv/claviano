import type { Hand, Note } from '../note';
import { pedalSpans, type PedalKind } from '../pedal';
import { createScore, type GraceSound, type Score, type TempoMark, type TimePoint } from '../score';
import { firstAtOrAfter, lastAtOrBefore } from '../search';
import { dynamicsAlongPage, levelCurve, withHairpinLevels } from './dynamics';
import { graceTiming } from './grace';
import { performanceOrder, type BarNavigation } from './navigation';
import type { Notation, PedalMove, TempoChange } from './notation';
import { arpeggioDelays, neighbour, playOrnament, playTremolo, playTremoloBetween } from './ornaments';
import { midiOf } from './spelling';
import type { Articulation } from './written';

/*
 * Playing what is written: from the notation of a piece (see notation.ts) to its notes in time.
 * These are the rules a pianist learns from a theory textbook, each in its own place:
 *
 * - grace notes and ornaments stand for quick notes (grace.ts, ornaments.ts);
 * - articulation shortens or stresses a note; dynamics set how loud it is (dynamics.ts);
 * - tied notes sound as one; a fermata holds the music;
 * - repeats, voltas and jumps decide the order the bars are played in (navigation.ts);
 * - tempo marks turn beats into seconds; pedal marks into when the pedals are down.
 *
 * Nothing here knows which file format the notation was read from, nor how it is drawn.
 */

const DEFAULT_TEMPO = 120;
/** Levels are a percentage of forte, and forte is MIDI velocity 90; this is the level with no mark yet. */
const DEFAULT_DYNAMICS = 80;

/** A note as it sounds within its printed bar, before the bars are put in playing order. */
interface Sound {
  pitch: number;
  staff: number;
  beat: number;
  beats: number;
  /** Worked out once all the dynamics along the page are known; 0 until then. */
  velocity: number;
  /** The note's own loudness from the source, if it has one. */
  ownDynamics: number | null;
  /** How much louder its articulation makes it (an accent). */
  loudness: number;
  hand: Hand;
  /** Share of its length the note sounds for (staccato is shorter). */
  soundingLength: number;
  tieStart: boolean;
  tieStop: boolean;
  fermata: boolean;
  /** Part of a rolled chord: its notes come in one after another (worked out at the end of the bar). */
  roll?: 'up' | 'down';
  /** One side of a tremolo between two notes or chords (worked out at the end of the bar). */
  tremolo?: { type: 'start' | 'stop'; strokes: number };
}

/** A printed bar with what sounds in it. */
interface Measure {
  start: number;
  length: number;
  navigation: MutableNavigation;
  sounds: Sound[];
  tempos: TempoChange[];
  pedal: PedalMove[];
}

interface PendingNote {
  pitch: number;
  beat: number;
  beats: number;
  velocity: number;
  hand: Hand;
  soundingLength: number;
}

type MutableNavigation = { -readonly [K in keyof BarNavigation]: BarNavigation[K] };

/** Plays the notation: the score with its notes in time, and the notation kept beside them for the staff. */
export function performNotation(notation: Notation): Score {
  const measures: Measure[] = notation.bars.map((bar) => ({
    start: bar.start,
    length: bar.length,
    navigation: { ...bar.navigation },
    sounds: [],
    tempos: [],
    pedal: [],
  }));
  for (const tempo of notation.tempos) measures[tempo.bar]?.tempos.push(tempo);
  for (const move of notation.pedalMoves) measures[move.bar]?.pedal.push(move);

  // Grace notes: when each sounds, and how much later the note it leads to comes in.
  const graceSounds: GraceSound[] = [];
  const delays = new Map<number, number>();
  for (const group of notation.graces) {
    const to = group.leadsTo === null ? null : notation.notes[group.leadsTo];
    const count = group.notes.filter((grace) => !grace.chord).length;
    const timing = graceTiming({ count, slash: group.notes[0]?.slash ?? false }, to ? { beats: to.beats, dotted: to.duration.dots > 0 } : null, group.beat);
    if (group.leadsTo !== null) delays.set(group.leadsTo, timing.delay);
    graceSounds.push({ beat: timing.start, each: timing.each });
    let slot = -1;
    for (const grace of group.notes) {
      if (!grace.chord || slot < 0) slot++;
      measures[group.bar]!.sounds.push({
        pitch: grace.sounding,
        staff: grace.staff,
        beat: timing.start + slot * timing.each,
        beats: timing.each,
        velocity: 0,
        ownDynamics: null,
        loudness: 1,
        hand: grace.hand,
        soundingLength: 1,
        tieStart: false,
        tieStop: false,
        fermata: false,
      });
    }
  }

  // The notes themselves: one sound each, or the several quick ones an ornament or a tremolo stands for.
  const keys = [...notation.keySignatures].sort((a, b) => a.beat - b.beat);
  let delay = 0; // of the chord being read: every note of it comes in after the appoggiatura
  notation.notes.forEach((note, index) => {
    if (!note.chord) delay = delays.get(index) ?? 0;
    const effect = articulationEffect(note.articulations);
    const beat = note.beat + delay;
    const beats = note.beats - delay;
    const [ornament] = note.ornaments;
    const fifths = keys[lastAtOrBefore(keys, note.beat + 1e-9, (key) => key.beat)]?.fifths ?? 0;
    // Under an octave shift the note is printed octaves away from where it sounds; its neighbours are counted from there.
    const spelled = { ...note.pitch, octave: note.pitch.octave + Math.round((note.sounding - midiOf(note.pitch)) / 12) };
    const pieces = ornament
      ? playOrnament(
          ornament.kind,
          note.sounding,
          beats,
          neighbour(spelled, 1, fifths, ornament.accidentalAbove),
          neighbour(spelled, -1, fifths, ornament.accidentalBelow),
        )
      : note.tremolo?.type === 'single'
        ? playTremolo(note.sounding, beats, note.tremolo.strokes)
        : [{ pitch: note.sounding, offset: 0, beats }];
    pieces.forEach((piece, i) => {
      const last = i === pieces.length - 1;
      measures[note.bar]!.sounds.push({
        pitch: piece.pitch,
        staff: note.staff,
        beat: beat + piece.offset,
        beats: piece.beats,
        velocity: 0,
        ownDynamics: note.dynamics,
        loudness: effect.loudness,
        hand: note.hand,
        soundingLength: last ? effect.length : 1,
        tieStart: last && note.tieStart,
        tieStop: i === 0 && note.tieStop,
        fermata: note.fermata !== null,
        ...(note.arpeggio && pieces.length === 1 ? { roll: note.arpeggio } : {}),
        ...(note.tremolo && note.tremolo.type !== 'single' ? { tremolo: { type: note.tremolo.type, strokes: note.tremolo.strokes } } : {}),
      });
    });
  });
  for (const measure of measures) measure.sounds = rollChords(alternateTremolos(measure.sounds));

  // How loud each note is: its own level, a stress written at it, or the level in force along the page.
  const dynamics = dynamicsAlongPage(notation.dynamics, notation.dynamicLevels, notation.hairpins);
  const { hairpins } = dynamics;
  const levelAt = levelCurve(withHairpinLevels(dynamics.levels, hairpins, DEFAULT_DYNAMICS), hairpins, DEFAULT_DYNAMICS);
  const accents = [...dynamics.accents].sort((a, b) => a.beat - b.beat);
  for (const measure of measures) {
    for (const sound of measure.sounds) {
      // A sforzando (or the f of an fp) on the notes it is written at.
      const accent = accents[firstAtOrAfter(accents, sound.beat - 1e-6, (a) => a.beat)];
      const stress = accent && Math.abs(accent.beat - sound.beat) < 1e-6 ? accent : null;
      const level = sound.ownDynamics ?? stress?.level ?? levelAt(sound.beat);
      sound.velocity = Math.min(1, ((level * 0.9) / 127) * sound.loudness * (stress?.factor ?? 1));
    }
  }

  resolveJumpTargets(measures.map((m) => m.navigation));
  const performance = perform(measures);

  const hasNavigation = measures.some((m) => Object.keys(m.navigation).length > 0);
  const end = measures.reduce((sum, measure) => sum + measure.length, 0);

  return createScore(
    notation.title,
    performance.notes.map(
      (n): Note => ({
        pitch: n.pitch,
        start: performance.toSeconds(n.beat),
        duration: (performance.toSeconds(n.beat + n.beats) - performance.toSeconds(n.beat)) * n.soundingLength,
        beat: n.beat,
        beats: n.beats,
        velocity: n.velocity,
        hand: n.hand,
      }),
    ),
    performance.barBeats.map(performance.toSeconds),
    {
      barBeats: performance.barBeats,
      barWritten: performance.barWritten,
      writtenBarBeats: measures.map((m) => m.start),
      writtenEndBeat: end,
      navigation: hasNavigation ? measures.map((m) => m.navigation) : [],
      pedal: performance.pedals.sustain,
      sostenutoPedal: performance.pedals.sostenuto,
      softPedal: performance.pedals.soft,
      timeMap: performance.timeMap,
      tempoMarks: distinctTempoMarks(notation.tempoMarks),
      tempos: notation.tempos,
      pedalMoves: notation.pedalMoves,
      dynamicLevels: notation.dynamicLevels,
      octaveShifts: notation.octaveShifts,
      dynamics: notation.dynamics,
      hairpins: hairpins.filter((h) => h.drawn),
      pedalMarks: notation.pedalMarks,
      timeSignatures: notation.timeSignatures,
      keySignatures: notation.keySignatures,
      clefs: notation.clefs,
      rests: notation.rests,
      graces: notation.graces,
      graceSounds,
      written: notation.notes,
    },
  );
}

/**
 * How articulation changes the sound: the share of its written length a note sounds for,
 * and how much louder it is. Legato and tenuto keep the full length.
 */
const SOUNDING_LENGTH: Partial<Record<Articulation, number>> = { staccatissimo: 0.25, staccato: 0.5, portato: 0.75 };
const LOUDNESS: Partial<Record<Articulation, number>> = { accent: 1.2, marcato: 1.35 };

/** The combined effect of a note's articulations on its sound. */
function articulationEffect(articulations: readonly Articulation[]): { length: number; loudness: number } {
  return {
    length: Math.min(1, ...articulations.map((a) => SOUNDING_LENGTH[a] ?? 1)),
    loudness: Math.max(1, ...articulations.map((a) => LOUDNESS[a] ?? 1)),
  };
}

/** A note under a fermata is held this many times its length. */
const FERMATA_HOLD = 2;

/**
 * Marks in page order, without repeats of the one in force (files often restate the tempo). At one
 * place a printed mark wins over one worked out from a bare <sound tempo>.
 */
function distinctTempoMarks(marks: readonly TempoMark[]): TempoMark[] {
  const result: TempoMark[] = [];
  for (const mark of [...marks].sort((a, b) => a.beat - b.beat)) {
    const last = result.at(-1);
    if (last && Math.abs(last.beat - mark.beat) < 1e-9) {
      if (last.printed && !mark.printed) continue;
      result.pop();
    }
    const previous = result.at(-1);
    const same = previous && previous.perMinute === mark.perMinute && previous.unit.value === mark.unit.value && previous.unit.dots === mark.unit.dots;
    if (!same) result.push(mark);
  }
  return result.map(({ beat, unit, perMinute }) => ({ beat, unit, perMinute }));
}

/**
 * Files do not always say which printed 𝄋 / 𝄌 is the target of a jump; when they only print
 * the signs, the segno is the first one and the coda the last one that is not a "To Coda".
 */
function resolveJumpTargets(bars: MutableNavigation[]): void {
  if (!bars.some((b) => b.segno)) {
    const sign = bars.find((b) => b.segnoSign);
    if (sign) sign.segno = true;
  }
  if (!bars.some((b) => b.coda)) {
    const sign = bars.filter((b) => b.codaSign && !b.toCoda).at(-1);
    if (sign) sign.coda = true;
  }
}

/** The second pass: bars in performance order, notes shifted into place, ties joined, fermatas held. */
function perform(measures: readonly Measure[]) {
  const order = performanceOrder(measures.map((m) => m.navigation));
  const barBeats: number[] = [];
  const barWritten: number[] = [];
  const firstStart: number[] = [];
  const notes: PendingNote[] = [];
  const tempos: { beat: number; bpm: number }[] = [];
  const fermatas: [number, number][] = [];
  const pedal: (PedalMove & { time: number })[] = [];
  const openTies = new Map<string, PendingNote>();

  let start = 0;
  for (const index of order) {
    const measure = measures[index]!;
    const shift = start - measure.start;
    barBeats.push(start);
    barWritten.push(index);
    firstStart[index] ??= start;
    for (const tempo of measure.tempos) tempos.push({ beat: tempo.beat + shift, bpm: tempo.bpm });
    for (const event of measure.pedal) pedal.push({ ...event, time: event.beat + shift });

    for (const sound of measure.sounds) {
      const beat = sound.beat + shift;
      if (sound.fermata) fermatas.push([beat, beat + sound.beats]);
      const tieKey = `${sound.pitch}|${sound.staff}`;
      const continued = sound.tieStop ? openTies.get(tieKey) : undefined;
      if (continued) {
        // The second half of a tie: the note keeps sounding, so lengthen the first one.
        continued.beats = beat + sound.beats - continued.beat;
        if (!sound.tieStart) openTies.delete(tieKey);
        continue;
      }
      const note: PendingNote = {
        pitch: sound.pitch,
        beat,
        beats: sound.beats,
        velocity: sound.velocity,
        hand: sound.hand,
        soundingLength: sound.soundingLength,
      };
      notes.push(note);
      if (sound.tieStart) openTies.set(tieKey, note);
    }
    start += measure.length;
  }

  const held = mergeSpans(fermatas);
  const toSeconds = withFermatas(beatsToSecondsConverter(tempos), held);
  // Time runs evenly between bar starts, tempo changes and fermata edges.
  const corners = [...new Set([...barBeats, ...tempos.map((t) => t.beat), ...held.flat(), start])].sort((a, b) => a - b);
  const timeMap: TimePoint[] = corners.map((beat) =>
    held.some(([from, to]) => beat >= from && beat < to) ? { beat, time: toSeconds(beat), hold: true } : { beat, time: toSeconds(beat) },
  );
  return {
    barBeats,
    barWritten,
    firstStart,
    notes,
    toSeconds,
    timeMap,
    // Beats and seconds go the same way, so spans can be joined in beats and then converted.
    pedals: Object.fromEntries(
      (['sustain', 'sostenuto', 'soft'] as const).map((kind) => [
        kind,
        pedalSpans(
          pedal.filter((event) => event.pedal === kind),
          start,
        ).map((span) => ({ start: toSeconds(span.start), end: toSeconds(span.end) })),
      ]),
    ) as Record<PedalKind, { start: number; end: number }[]>,
  };
}

/** Fermata spans with overlapping ones (a chord, both hands) joined, in order. */
function mergeSpans(spans: [number, number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/**
 * Holds fermatas: time under a fermata passes FERMATA_HOLD times slower, and everything after it
 * moves later by the extra time. `merged` comes from mergeSpans.
 */
function withFermatas(toSeconds: (beat: number) => number, merged: [number, number][]): (beat: number) => number {
  if (merged.length === 0) return toSeconds;
  // The extra time of all fermatas before each one, so a beat only looks at the fermata it is in or after.
  const extraBefore: number[] = [0];
  for (const [from, to] of merged) {
    extraBefore.push(extraBefore.at(-1)! + (toSeconds(to) - toSeconds(from)) * (FERMATA_HOLD - 1));
  }
  return (beat) => {
    const i = lastAtOrBefore(merged, beat, ([from]) => from); // the fermata `beat` is in, or the last one before it
    const fermata = merged[i];
    if (!fermata) return toSeconds(beat);
    const [from, to] = fermata;
    const inside = (toSeconds(Math.min(beat, to)) - toSeconds(from)) * (FERMATA_HOLD - 1);
    return toSeconds(beat) + extraBefore[i]! + inside;
  };
}

/**
 * Tremolos between two notes or chords: the two are played in turn for their whole length
 * together, instead of one after the other.
 */
function alternateTremolos(sounds: Sound[]): Sound[] {
  if (!sounds.some((sound) => sound.tremolo)) return sounds;
  const result = sounds.filter((sound) => !sound.tremolo);
  const same = (a: Sound, b: Sound) => a.staff === b.staff && Math.abs(a.beat - b.beat) < 1e-6;
  const starts = sounds.filter((sound) => sound.tremolo?.type === 'start');
  const stops = sounds.filter((sound) => sound.tremolo?.type === 'stop');
  const done = new Set<Sound>();
  for (const start of starts) {
    if (done.has(start)) continue;
    const first = starts.filter((sound) => same(sound, start));
    // The other side: the first notes with a "stop" on that staff after this one.
    const next = stops.find((sound) => sound.staff === start.staff && sound.beat > start.beat - 1e-6 && !done.has(sound));
    const second = next ? stops.filter((sound) => same(sound, next)) : [];
    for (const sound of [...first, ...second]) done.add(sound);
    if (!next) {
      result.push(...first.map(({ tremolo: _, ...sound }) => sound));
      continue;
    }
    const length = next.beat + next.beats - start.beat;
    for (const piece of playTremoloBetween(length, start.tremolo!.strokes)) {
      for (const { tremolo: _, ...sound } of piece.second ? second : first) {
        result.push({ ...sound, beat: start.beat + piece.offset, beats: piece.beats, tieStart: false, tieStop: false, soundingLength: 1 });
      }
    }
  }
  // A "stop" with no "start" before it is played as written.
  result.push(...stops.filter((sound) => !done.has(sound)).map(({ tremolo: _, ...sound }) => sound));
  return result;
}

/**
 * Rolled chords: the notes marked with an arpeggio sign that start together (on either staff: a
 * roll through both hands is one wave) come in one after another, each held to its own end.
 */
function rollChords(sounds: Sound[]): Sound[] {
  const rolled = sounds.filter((sound) => sound.roll);
  const done = new Set<Sound>();
  for (const first of rolled) {
    if (done.has(first)) continue;
    const chord = rolled.filter((sound) => Math.abs(sound.beat - first.beat) < 1e-6);
    chord.sort((a, b) => (first.roll === 'down' ? b.pitch - a.pitch : a.pitch - b.pitch));
    const delays = arpeggioDelays(chord.length, Math.min(...chord.map((sound) => sound.beats)));
    chord.forEach((sound, i) => {
      done.add(sound);
      const delay = delays[i] ?? 0;
      sound.beat += delay;
      sound.beats -= delay;
    });
  }
  return sounds;
}

/** Seconds from quarter notes, following tempo changes (in quarter notes per minute). */
function beatsToSecondsConverter(tempos: { beat: number; bpm: number }[]): (beat: number) => number {
  const sorted = [...tempos].sort((a, b) => a.beat - b.beat);
  if (!sorted[0] || sorted[0].beat > 0) sorted.unshift({ beat: 0, bpm: DEFAULT_TEMPO });
  const segments: { beat: number; seconds: number; secondsPerBeat: number }[] = [];
  for (const [i, tempo] of sorted.entries()) {
    const previous = segments[i - 1];
    const seconds = previous ? previous.seconds + (tempo.beat - previous.beat) * previous.secondsPerBeat : 0;
    segments.push({ beat: tempo.beat, seconds, secondsPerBeat: 60 / tempo.bpm });
  }
  return (beat) => {
    const segment = segments[Math.max(0, lastAtOrBefore(segments, beat, (s) => s.beat))]!;
    return segment.seconds + (beat - segment.beat) * segment.secondsPerBeat;
  };
}
