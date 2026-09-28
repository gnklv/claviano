import { ScoreLoadError, type ScoreParser } from '../../application/ports/ScoreParser';
import type { Hand, Note } from '../../domain/note';
import { writtenDuration, type NoteValue } from '../../domain/notation/noteValue';
import type { Accidental, Alteration, Letter } from '../../domain/notation/spelling';
import type { Articulation, BeamMark, Clef, ClefChange, SlurMark, WrittenNote, WrittenRest } from '../../domain/notation/written';
import { performanceOrder, type BarNavigation } from '../../domain/notation/navigation';
import { pedalSpans, type PedalKind, type PedalMark } from '../../domain/pedal';
import { createScore, type KeySignature, type Score, type TimePoint, type TimeSignature } from '../../domain/score';

/*
 * MusicXML (https://www.w3.org/2021/06/musicxml40/): the notation format of MuseScore, Finale,
 * Sibelius and others. It gives two views of the music: sounding notes for playback (tied notes
 * become one), and the notes as printed for the staff (value, tuplet, accidental, stem, beams).
 *
 * Only uncompressed files (.musicxml, .xml); compressed .mxl archives are not read.
 * Not yet: grace notes (skipped), more than one part (the first one is read).
 */

const DEFAULT_TEMPO = 120;
/** MusicXML dynamics are a percentage of forte, and forte is MIDI velocity 90. */
const DEFAULT_DYNAMICS = 80;

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEP_LETTERS: Record<string, Letter> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** MusicXML note types we can draw; shorter ones are drawn as thirty-seconds, longer as wholes. */
const NOTE_TYPES: Record<string, NoteValue> = {
  breve: 'whole',
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirtySecond',
  '64th': 'thirtySecond',
  '128th': 'thirtySecond',
};

const ACCIDENTALS: Record<string, Accidental> = {
  sharp: 'sharp',
  flat: 'flat',
  natural: 'natural',
  'double-sharp': 'double-sharp',
  'sharp-sharp': 'double-sharp',
  'flat-flat': 'double-flat',
  'double-flat': 'double-flat',
};

const BEAM_MARKS = new Set<string>(['begin', 'continue', 'end', 'forward hook', 'backward hook']);

const ARTICULATIONS: Record<string, Articulation> = {
  staccato: 'staccato',
  staccatissimo: 'staccatissimo',
  spiccato: 'staccatissimo',
  tenuto: 'tenuto',
  'detached-legato': 'portato',
  accent: 'accent',
  'strong-accent': 'marcato',
};

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

export class InvalidMusicXmlError extends ScoreLoadError {
  constructor(message: string, code: 'invalid-file' | 'unsupported-feature' = 'invalid-file') {
    super(code, message);
    this.name = 'InvalidMusicXmlError';
  }
}

export class MusicXmlParser implements ScoreParser {
  canParse(fileName: string): boolean {
    return /\.(musicxml|xml)$/i.test(fileName);
  }

  parse(data: ArrayBuffer, title: string): Score {
    const xml = new TextDecoder().decode(data);
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new InvalidMusicXmlError('Not well-formed XML');
    const root = document.documentElement;
    if (root.nodeName === 'score-timewise') {
      throw new InvalidMusicXmlError('Timewise MusicXML is not supported', 'unsupported-feature');
    }
    if (root.nodeName !== 'score-partwise') throw new InvalidMusicXmlError('Not a MusicXML score');

    const part = root.querySelector(':scope > part');
    if (!part) throw new InvalidMusicXmlError('The score has no parts');
    return readPart(part, workTitle(root) ?? title);
  }
}

function workTitle(root: Element): string | null {
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim() || null;
  return text(':scope > work > work-title') ?? text(':scope > movement-title');
}

const childText = (element: Element, name: string): string | null =>
  element.querySelector(`:scope > ${name}`)?.textContent?.trim() ?? null;

const childNumber = (element: Element, name: string): number | null => {
  const text = childText(element, name);
  return text === null || text === '' ? null : Number(text);
};

interface PendingNote {
  pitch: number;
  beat: number;
  beats: number;
  velocity: number;
  hand: Hand;
  /** Share of its length the note sounds for (staccato is shorter). */
  soundingLength: number;
}

/** A printed note before its seconds are known (they need the whole tempo map). */
type PendingWritten = Omit<WrittenNote, 'start' | 'end'>;

/** Everything a printed bar contributes, gathered in the first pass. */
interface Measure {
  /** Where it starts and how long it is, along the page, in quarter notes. */
  start: number;
  length: number;
  navigation: MutableNavigation;
  /** Its notes as they sound, in document order, with page beats. */
  sounds: SoundEvent[];
  tempos: { beat: number; bpm: number }[];
  /** Pedal presses and releases, with page beats. */
  pedal: PedalMove[];
}

interface SoundEvent {
  pitch: number;
  staff: number;
  beat: number;
  beats: number;
  velocity: number;
  hand: Hand;
  soundingLength: number;
  tieStart: boolean;
  tieStop: boolean;
  fermata: boolean;
}

type MutableNavigation = { -readonly [K in keyof BarNavigation]: BarNavigation[K] };

/** A note under a fermata is held this many times its length. */
const FERMATA_HOLD = 2;

/**
 * Reads a part in two passes. First along the page, bar by bar: the printed notes, rests, clefs
 * and signatures for the staff, and each bar's sounding notes, tempo changes and navigation.
 * Then in performance order (repeats, voltas and jumps unrolled): the notes as they are played.
 */
function readPart(part: Element, title: string): Score {
  let divisions = 1;
  let staves = 1;
  let dynamics = DEFAULT_DYNAMICS;
  let measureStart = 0; // along the page, in quarter notes
  let timeSignature: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
  let ending: { numbers: number[]; label: string } | null = null;

  const measures: Measure[] = [];
  const written: PendingWritten[] = [];
  const writtenMeasure: number[] = []; // for each printed note, its bar
  const rests: WrittenRest[] = [];
  const clefChanges: ClefChange[] = [];
  /** The clef in force on each staff; engravers may switch the lower staff to treble and back. */
  const clefs = new Map<number, Clef>([
    [1, 'treble'],
    [2, 'bass'],
  ]);
  const timeSignatures: TimeSignature[] = [];
  const keySignatures: KeySignature[] = [];
  const pedalMarks: PedalMark[] = [];
  const pedalState: PedalState = { sustain: false, sostenuto: null, sostenutoLast: false };

  for (const measureElement of part.querySelectorAll(':scope > measure')) {
    const measure: Measure = { start: measureStart, length: 0, navigation: {}, sounds: [], tempos: [], pedal: [] };
    const nav = measure.navigation;
    if (ending) nav.ending = ending.numbers;
    let endingEndsHere = false;
    let cursor = 0; // position inside the measure, in divisions
    let longest = 0; // how far the measure reaches, in divisions
    let lastStart = 0; // start of the previous note, for chords

    const beatAt = (position: number) => measureStart + position / divisions;

    for (const element of measureElement.children) {
      switch (element.nodeName) {
        case 'attributes': {
          divisions = childNumber(element, 'divisions') ?? divisions;
          staves = childNumber(element, 'staves') ?? staves;
          const key = element.querySelector(':scope > key');
          const fifths = key && childNumber(key, 'fifths');
          if (key && fifths !== null) {
            keySignatures.push({ beat: beatAt(cursor), fifths, minor: childText(key, 'mode') === 'minor' });
          }
          for (const clef of element.querySelectorAll(':scope > clef')) {
            const sign = childText(clef, 'sign');
            if (sign !== 'G' && sign !== 'F') continue; // C clefs are rare in piano music
            const staff = Number(clef.getAttribute('number') ?? 1);
            const value: Clef = sign === 'G' ? 'treble' : 'bass';
            clefs.set(staff, value);
            clefChanges.push({ staff, beat: beatAt(cursor), clef: value });
          }
          const time = element.querySelector(':scope > time');
          const numerator = time && childNumber(time, 'beats');
          const denominator = time && childNumber(time, 'beat-type');
          if (numerator && denominator) {
            timeSignature = { beat: beatAt(cursor), numerator, denominator };
            timeSignatures.push(timeSignature);
          }
          break;
        }
        case 'barline': {
          const repeat = element.querySelector(':scope > repeat');
          if (repeat?.getAttribute('direction') === 'forward') nav.repeatStart = true;
          if (repeat?.getAttribute('direction') === 'backward') {
            nav.repeatEnd = { times: Number(repeat.getAttribute('times') ?? 2) || 2 };
          }
          const endingElement = element.querySelector(':scope > ending');
          if (endingElement) {
            const numbers = (endingElement.getAttribute('number') ?? '1')
              .split(/[,\s]+/)
              .map((n) => parseInt(n, 10))
              .filter((n) => n > 0);
            const type = endingElement.getAttribute('type');
            if (type === 'start') {
              ending = { numbers, label: endingElement.textContent?.trim() || `${numbers.join(', ')}.` };
              nav.ending = numbers;
              nav.endingLabel = ending.label;
            } else if (type === 'stop' || type === 'discontinue') {
              nav.ending ??= numbers;
              nav.endingClosed = type === 'stop';
              endingEndsHere = true;
            }
          }
          break;
        }
        case 'direction':
        case 'sound': {
          const sound = element.nodeName === 'sound' ? element : element.querySelector(':scope > sound');
          const tempo = Number(sound?.getAttribute('tempo'));
          if (tempo > 0) measure.tempos.push({ beat: beatAt(cursor), bpm: tempo });
          const level = Number(sound?.getAttribute('dynamics'));
          if (level > 0) dynamics = level;
          readNavigation(element, sound, nav);
          // A direction may sit before the note it belongs to, shifted by its <offset>.
          const offset = element.nodeName === 'direction' ? (childNumber(element, 'offset') ?? 0) : 0;
          const pedal = readPedal(element, sound, beatAt(cursor + offset), pedalState);
          measure.pedal.push(...pedal.events);
          pedalMarks.push(...pedal.marks);
          break;
        }
        case 'backup':
          cursor -= childNumber(element, 'duration') ?? 0;
          break;
        case 'forward':
          cursor += childNumber(element, 'duration') ?? 0;
          longest = Math.max(longest, cursor);
          break;
        case 'note': {
          if (element.querySelector(':scope > grace')) break; // ornaments without their own time
          const duration = childNumber(element, 'duration') ?? 0;
          const isChord = element.querySelector(':scope > chord') !== null;
          const start = isChord ? lastStart : cursor;
          if (!isChord) {
            lastStart = cursor;
            cursor += duration;
            longest = Math.max(longest, cursor);
          }

          const restElement = element.querySelector(':scope > rest');
          if (restElement) {
            const staff = childNumber(element, 'staff') ?? 1;
            rests.push(readRest(element, restElement, { staff, clef: clefs.get(staff) ?? 'treble', beat: beatAt(start), beats: duration / divisions }));
            break;
          }
          const pitchElement = element.querySelector(':scope > pitch');
          if (!pitchElement) break; // an unpitched note
          const staff = childNumber(element, 'staff') ?? 1;
          const noteDynamics = Number(element.getAttribute('dynamics'));
          const ties = [...element.querySelectorAll(':scope > tie')].map((tie) => tie.getAttribute('type'));
          const beats = duration / divisions;
          const hand: Hand = staves > 1 && staff > 1 ? 'left' : 'right';
          const clef = clefs.get(staff) ?? (staff > 1 ? 'bass' : 'treble');

          const printed = readWritten(element, pitchElement, { staff, clef, hand, isChord, beat: beatAt(start), beats, ties });
          written.push(printed);
          writtenMeasure.push(measures.length);

          const effect = articulationEffect(printed.articulations);
          measure.sounds.push({
            pitch: midiPitch(pitchElement),
            staff,
            beat: beatAt(start),
            beats,
            velocity: Math.min(1, (((noteDynamics > 0 ? noteDynamics : dynamics) * 0.9) / 127) * effect.loudness),
            hand,
            soundingLength: effect.length,
            tieStart: ties.includes('start'),
            tieStop: ties.includes('stop'),
            fermata: printed.fermata !== null,
          });
          break;
        }
      }
    }

    // Files do not always close the last volta. A new ‖: never sits inside one, so it closes it.
    if (nav.repeatStart && ending && !nav.endingLabel) {
      delete nav.ending;
      ending = null;
    }

    // A pickup bar is shorter than its time signature says; trust what the measure contains.
    const nominal = (timeSignature.numerator * 4) / timeSignature.denominator;
    measure.length = longest > 0 ? longest / divisions : nominal;
    measureStart += measure.length;
    measures.push(measure);
    if (endingEndsHere) ending = null;
  }

  resolveJumpTargets(measures.map((m) => m.navigation));
  const performance = perform(measures);

  // Printed notes remember when they first sound: their bar's first performance, plus their offset in it.
  const writtenSeconds = (index: number, beat: number) => {
    const measure = measures[writtenMeasure[index]];
    const firstStart = performance.firstStart[writtenMeasure[index]] ?? measure.start;
    return performance.toSeconds(firstStart + beat - measure.start);
  };
  const hasNavigation = measures.some((m) => Object.keys(m.navigation).length > 0);

  return createScore(
    title,
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
      writtenEndBeat: measureStart,
      navigation: hasNavigation ? measures.map((m) => m.navigation) : [],
      pedal: performance.pedals.sustain,
      sostenutoPedal: performance.pedals.sostenuto,
      softPedal: performance.pedals.soft,
      timeMap: performance.timeMap,
      pedalMarks,
      timeSignatures,
      keySignatures,
      clefs: clefChanges,
      rests,
      written: written.map((note, i) => ({
        ...note,
        start: writtenSeconds(i, note.beat),
        end: writtenSeconds(i, note.beat + note.beats),
      })),
    },
  );
}

/** Repeat marks and jumps a <direction> or <sound> carries. */
function readNavigation(element: Element, sound: Element | null | undefined, nav: MutableNavigation): void {
  const types = element.querySelector(':scope > direction-type');
  if (types?.querySelector(':scope > segno')) nav.segnoSign = true;
  if (types?.querySelector(':scope > coda')) nav.codaSign = true;
  if (!sound) return;
  if (sound.getAttribute('segno')) nav.segno = true;
  if (sound.getAttribute('coda')) nav.coda = true;
  const jumps = {
    dacapo: sound.getAttribute('dacapo') === 'yes',
    dalsegno: !!sound.getAttribute('dalsegno'),
    fine: sound.getAttribute('fine') !== null,
    toCoda: !!sound.getAttribute('tocoda'),
  };
  if (jumps.dacapo) nav.jump = 'dacapo';
  if (jumps.dalsegno) nav.jump = 'dalsegno';
  if (jumps.fine) nav.fine = true;
  if (jumps.toCoda) nav.toCoda = true;
  // The words that go with a jump ("D.C. al Fine", "To Coda") are printed over the bar.
  const words = [...(types?.querySelectorAll(':scope > words') ?? [])].map((w) => w.textContent?.trim()).filter(Boolean);
  if ((jumps.dacapo || jumps.dalsegno || jumps.fine || jumps.toCoda) && words.length > 0) nav.text = words.join(' ');
}

/**
 * Which pedals are down along the page. The middle (sostenuto) pedal starts with its own type but
 * ends with a plain "stop", so a stop needs to know which pedal it lifts: the one with its number,
 * or else the only one down, or else the one pressed last (like nested brackets).
 */
interface PedalState {
  sustain: boolean;
  /** The `number` of a sostenuto pedal that is down ('' when unnumbered), or null. */
  sostenuto: string | null;
  sostenutoLast: boolean;
}

type PedalMove = { pedal: PedalKind; beat: number; down: boolean };

/** "yes" / "no", or how far down a pedal is in percent. */
const pedalDown = (value: string) => value === 'yes' || (value !== 'no' && Number(value) >= 50);

/** The soft pedal is written in words: "una corda" (u.c.) presses it, "tre corde" (t.c.) lifts it. */
const UNA_CORDA = /\buna\s+corda\b|^u\.\s*c\.$/i;
const TRE_CORDE = /\btre\s+corde\b|^t\.\s*c\.$/i;

/**
 * The pedals a <direction> or <sound> carries: presses and releases for playback, and the printed
 * marks for the staff. Printed marks decide; bare <sound damper-pedal>, <sound sostenuto-pedal>
 * and <sound soft-pedal> only sound.
 */
function readPedal(
  element: Element,
  sound: Element | null | undefined,
  beat: number,
  state: PedalState,
): { events: PedalMove[]; marks: PedalMark[] } {
  const events: PedalMove[] = [];
  const marks: PedalMark[] = [];
  const pedal = element.querySelector(':scope > direction-type > pedal');
  const type = pedal?.getAttribute('type');
  const number = pedal?.getAttribute('number') ?? '';

  // The middle pedal.
  const byNumber = number !== '' && state.sostenuto !== null && state.sostenuto !== '';
  const liftsSostenuto =
    type === 'stop' &&
    state.sostenuto !== null &&
    (byNumber ? number === state.sostenuto : !state.sustain || state.sostenutoLast);
  if (type === 'sostenuto' || liftsSostenuto) {
    const down = type === 'sostenuto';
    state.sostenuto = down ? number : null;
    state.sostenutoLast = down;
    events.push({ pedal: 'sostenuto', beat, down });
    marks.push({ pedal: 'sostenuto', beat, type: down ? 'start' : 'stop', sign: true, line: true });
  } else if (pedal && (type === 'start' || type === 'stop' || type === 'change')) {
    // The right pedal.
    state.sustain = type !== 'stop';
    state.sostenutoLast = false;
    // By the standard, signs ("Ped." and "✱") are the default unless the pedal is drawn with a line.
    const line = pedal.getAttribute('line') === 'yes';
    const sign = pedal.getAttribute('sign') ? pedal.getAttribute('sign') === 'yes' : !line;
    if (type === 'change') events.push({ pedal: 'sustain', beat, down: false });
    events.push({ pedal: 'sustain', beat, down: type !== 'stop' });
    marks.push({ pedal: 'sustain', beat, type, sign, line });
  } else if (type === 'resume' || type === 'discontinue') {
    state.sustain = type === 'resume';
    if (state.sustain) state.sostenutoLast = false;
    events.push({ pedal: 'sustain', beat, down: state.sustain });
  } else {
    const damper = sound?.getAttribute('damper-pedal');
    if (damper) {
      state.sustain = pedalDown(damper);
      events.push({ pedal: 'sustain', beat, down: state.sustain });
    }
    const sostenuto = sound?.getAttribute('sostenuto-pedal');
    if (sostenuto) {
      const down = pedalDown(sostenuto);
      state.sostenuto = down ? '' : null;
      events.push({ pedal: 'sostenuto', beat, down });
    }
  }

  // The left pedal, in words; a bare <sound soft-pedal> only sounds.
  const words = [...element.querySelectorAll(':scope > direction-type > words')].map((w) => w.textContent?.trim() ?? '');
  const soft = words.find((text) => UNA_CORDA.test(text) || TRE_CORDE.test(text));
  if (soft) {
    const down = UNA_CORDA.test(soft);
    events.push({ pedal: 'soft', beat, down });
    marks.push({ pedal: 'soft', beat, type: down ? 'start' : 'stop', sign: false, line: false, text: soft });
  } else {
    const value = sound?.getAttribute('soft-pedal');
    if (value) events.push({ pedal: 'soft', beat, down: pedalDown(value) });
  }
  return { events, marks };
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
    const measure = measures[index];
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
  return (beat) => {
    let seconds = toSeconds(beat);
    for (const [from, to] of merged) {
      if (beat <= from) break;
      seconds += (toSeconds(Math.min(beat, to)) - toSeconds(from)) * (FERMATA_HOLD - 1);
    }
    return seconds;
  };
}

/** The printed side of a <note>: what the engraver wrote, taken as is. */
function readWritten(
  element: Element,
  pitchElement: Element,
  at: { staff: number; clef: Clef; hand: Hand; isChord: boolean; beat: number; beats: number; ties: (string | null)[] },
): PendingWritten {
  const alter = Math.max(-2, Math.min(2, Math.round(childNumber(pitchElement, 'alter') ?? 0))) as Alteration;
  const type = NOTE_TYPES[childText(element, 'type') ?? ''];
  const dots = element.querySelectorAll(':scope > dot').length > 0 ? 1 : 0;

  const modification = element.querySelector(':scope > time-modification');
  const actual = modification && childNumber(modification, 'actual-notes');
  const normal = modification && childNumber(modification, 'normal-notes');
  const tuplets = [...element.querySelectorAll(':scope > notations > tuplet')];
  const start = tuplets.find((t) => t.getAttribute('type') === 'start');
  const bracket = start?.getAttribute('bracket');

  const beams: BeamMark[] = [];
  for (const beam of element.querySelectorAll(':scope > beam')) {
    const level = Number(beam.getAttribute('number') ?? 1);
    const mark = beam.textContent?.trim() ?? '';
    if (level >= 1 && BEAM_MARKS.has(mark)) beams[level - 1] = mark as BeamMark;
  }
  const stem = childText(element, 'stem');

  return {
    staff: at.staff,
    voice: childText(element, 'voice') ?? '1',
    hand: at.hand,
    chord: at.isChord,
    clef: at.clef,
    pitch: {
      letter: STEP_LETTERS[childText(pitchElement, 'step') ?? ''],
      octave: childNumber(pitchElement, 'octave') ?? 4,
      alteration: alter,
    },
    beat: at.beat,
    beats: at.beats,
    // Without <type>, fall back to the value its length suggests (undoing any tuplet squeeze).
    duration: type ? { value: type, dots } : writtenDuration(at.beats * (actual && normal ? actual / normal : 1)),
    tuplet: actual && normal ? { actual, normal } : null,
    tupletStart: start
      ? { showNumber: start.getAttribute('show-number') !== 'none', bracket: bracket === 'yes' ? true : bracket === 'no' ? false : null }
      : null,
    tupletStop: tuplets.some((t) => t.getAttribute('type') === 'stop'),
    accidental: ACCIDENTALS[childText(element, 'accidental') ?? ''] ?? null,
    stem: stem === 'up' || stem === 'down' ? stem : null,
    beams: [...beams].map((mark) => mark ?? 'continue'),
    tieStart: at.ties.includes('start'),
    tieStop: at.ties.includes('stop'),
    articulations: [...element.querySelectorAll(':scope > notations > articulations > *')]
      .map((a) => ARTICULATIONS[a.nodeName])
      .filter((a): a is Articulation => a !== undefined),
    fermata: fermataOf(element),
    slurs: [...element.querySelectorAll(':scope > notations > slur')].flatMap((slur): SlurMark[] => {
      const type = slur.getAttribute('type');
      if (type !== 'start' && type !== 'stop') return []; // "continue" only matters across systems
      const placement = slur.getAttribute('placement');
      return [
        {
          type,
          number: Number(slur.getAttribute('number') ?? 1),
          placement: placement === 'above' || placement === 'below' ? placement : null,
        },
      ];
    }),
  };
}

function fermataOf(element: Element): WrittenNote['fermata'] {
  const fermata = element.querySelector(':scope > notations > fermata');
  if (!fermata) return null;
  return fermata.getAttribute('type') === 'inverted' ? 'inverted' : 'upright';
}

/** A printed rest: its value, and where the engraver placed it if the file says. */
function readRest(
  element: Element,
  rest: Element,
  at: { staff: number; clef: Clef; beat: number; beats: number },
): WrittenRest {
  const type = NOTE_TYPES[childText(element, 'type') ?? ''];
  const dots = element.querySelectorAll(':scope > dot').length > 0 ? 1 : 0;
  const step = childText(rest, 'display-step');
  const octave = childNumber(rest, 'display-octave');
  return {
    staff: at.staff,
    voice: childText(element, 'voice') ?? '1',
    beat: at.beat,
    duration: type ? { value: type, dots } : writtenDuration(at.beats),
    // Some editors mark whole-bar rests explicitly, others just leave out the type.
    measure: rest.getAttribute('measure') === 'yes' || !type,
    displayPitch: step && octave !== null && STEP_LETTERS[step] !== undefined ? { letter: STEP_LETTERS[step], octave } : null,
    clef: at.clef,
  };
}

/** MusicXML writes pitches like notation: step E, alter +1, octave 5 is Mi♯5. */
function midiPitch(pitch: Element): number {
  const step = STEP_SEMITONES[childText(pitch, 'step') ?? ''];
  const octave = childNumber(pitch, 'octave');
  if (step === undefined || octave === null) throw new InvalidMusicXmlError('A note without a valid pitch');
  return 12 * (octave + 1) + step + Math.round(childNumber(pitch, 'alter') ?? 0);
}

/** Seconds from quarter notes, following tempo changes (in quarter notes per minute). */
function beatsToSecondsConverter(tempos: { beat: number; bpm: number }[]): (beat: number) => number {
  const sorted = [...tempos].sort((a, b) => a.beat - b.beat);
  if (sorted.length === 0 || sorted[0].beat > 0) sorted.unshift({ beat: 0, bpm: DEFAULT_TEMPO });
  const segments: { beat: number; seconds: number; secondsPerBeat: number }[] = [];
  for (const [i, tempo] of sorted.entries()) {
    const previous = segments[i - 1];
    const seconds = previous ? previous.seconds + (tempo.beat - previous.beat) * previous.secondsPerBeat : 0;
    segments.push({ beat: tempo.beat, seconds, secondsPerBeat: 60 / tempo.bpm });
  }
  return (beat) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.beat > beat) break;
      segment = candidate;
    }
    return segment.seconds + (beat - segment.beat) * segment.secondsPerBeat;
  };
}
