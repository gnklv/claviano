import { ScoreLoadError, type ScoreParser } from '../../application/ports/ScoreParser';
import type { Hand, Note } from '../../domain/note';
import { writtenDuration, type NoteValue } from '../../domain/notation/noteValue';
import type { Accidental, Alteration, Letter } from '../../domain/notation/spelling';
import { graceTiming } from '../../domain/notation/grace';
import {
  arpeggioDelays,
  neighbour,
  playOrnament,
  playTremolo,
  playTremoloBetween,
  type OrnamentKind,
  type OrnamentMark,
} from '../../domain/notation/ornaments';
import type {
  Articulation,
  BeamMark,
  Clef,
  ClefChange,
  SlurMark,
  WrittenGrace,
  WrittenNote,
  WrittenRest,
} from '../../domain/notation/written';
import { performanceOrder, type BarNavigation } from '../../domain/notation/navigation';
import { pedalSpans, type PedalKind, type PedalMark } from '../../domain/pedal';
import { lastAtOrBefore } from '../../domain/search';
import { pianoPart } from './pianoParts';
import { InvalidZipError, isZip, readZip } from './zip';
import { levelAt, MARK_LEVELS, withHairpinLevels, type DynamicLevel, type DynamicMark, type Hairpin } from '../../domain/notation/dynamics';
import {
  createScore,
  type KeySignature,
  type OctaveShift,
  type Score,
  type TempoMark,
  type TimePoint,
  type TimeSignature,
} from '../../domain/score';

/*
 * MusicXML (https://www.w3.org/2021/06/musicxml40/): the notation format of MuseScore, Finale,
 * Sibelius and others. It gives two views of the music: sounding notes for playback (tied notes
 * become one), and the notes as printed for the staff (value, tuplet, accidental, stem, beams).
 *
 * Plain files (.musicxml, .xml) and compressed ones (.mxl, a ZIP archive with the score inside).
 * Not yet: more than one part (the first one is read; a piano written as
 * two one-staff parts is joined into one, see pianoParts).
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

/** MusicXML ornament elements we draw and play ("shake" is an old name for the short trill). */
const ORNAMENTS: Record<string, OrnamentKind> = {
  'trill-mark': 'trill',
  mordent: 'mordent',
  'inverted-mordent': 'inverted-mordent',
  shake: 'inverted-mordent',
  turn: 'turn',
  'inverted-turn': 'inverted-turn',
  'delayed-turn': 'delayed-turn',
  'delayed-inverted-turn': 'delayed-inverted-turn',
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
    return /\.(musicxml|xml|mxl)$/i.test(fileName);
  }

  parse(data: ArrayBuffer, title: string): Score {
    const xml = new TextDecoder().decode(isZip(data) ? scoreInArchive(data) : data);
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new InvalidMusicXmlError('Not well-formed XML');
    const root = document.documentElement;
    if (root.nodeName === 'score-timewise') {
      throw new InvalidMusicXmlError('Timewise MusicXML is not supported', 'unsupported-feature');
    }
    if (root.nodeName !== 'score-partwise') throw new InvalidMusicXmlError('Not a MusicXML score');

    const part = pianoPart(root);
    if (!part) throw new InvalidMusicXmlError('The score has no parts');
    return readPart(part, workTitle(root) ?? title);
  }
}

/**
 * The score inside a compressed MusicXML file (.mxl): a ZIP archive whose META-INF/container.xml
 * names the score among its files (there may be others: images, a second copy as a PDF…).
 */
function scoreInArchive(data: ArrayBuffer): Uint8Array {
  try {
    const files = readZip(data);
    const container = files.get('META-INF/container.xml');
    const listed = container
      ? new DOMParser()
          .parseFromString(new TextDecoder().decode(container()), 'application/xml')
          .querySelector('rootfile')
          ?.getAttribute('full-path')
      : null;
    // Without a container (it is required, but not every writer knows): the first score-like file.
    const name = listed ?? [...files.keys()].find((file) => /\.(musicxml|xml)$/i.test(file) && !file.startsWith('META-INF/'));
    const score = name ? files.get(name) : undefined;
    if (!score) throw new InvalidMusicXmlError('The archive has no score');
    return score();
  } catch (error) {
    if (error instanceof InvalidZipError) throw new InvalidMusicXmlError(error.message);
    throw error;
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
  /** Worked out once the whole page is read (dynamics and hairpins along it); 0 until then. */
  velocity: number;
  /** The note's own loudness from the file (<note dynamics>), if it has one. */
  ownDynamics: number | null;
  /** How much louder its articulation makes it (an accent). */
  loudness: number;
  hand: Hand;
  soundingLength: number;
  tieStart: boolean;
  tieStop: boolean;
  fermata: boolean;
  /** Part of a rolled chord: its notes come in one after another (worked out at the end of the bar). */
  roll?: 'up' | 'down';
  /** One side of a tremolo between two notes or chords (worked out at the end of the bar). */
  tremolo?: { type: 'start' | 'stop'; strokes: number };
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
  let measureStart = 0; // along the page, in quarter notes
  let timeSignature: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
  let ending: { numbers: number[]; label: string } | null = null;

  const measures: Measure[] = [];
  const written: PendingWritten[] = [];
  const writtenMeasure: number[] = []; // for each printed note, its bar
  const rests: WrittenRest[] = [];
  const graces: WrittenGrace[] = [];
  const clefChanges: ClefChange[] = [];
  /** The clef in force on each staff; engravers may switch the lower staff to treble and back. */
  const clefs = new Map<number, Clef>([
    [1, 'treble'],
    [2, 'bass'],
  ]);
  const timeSignatures: TimeSignature[] = [];
  const keySignatures: KeySignature[] = [];
  const pedalMarks: PedalMark[] = [];
  /** `printed`: from a <metronome>; otherwise worked out from a <sound tempo>, in quarters. */
  const tempoMarks: (TempoMark & { printed: boolean })[] = [];
  /** Octave shifts in force on each staff (where they started, how many octaves), and the finished ones. */
  const openShifts = new Map<number, { start: number; octaves: number }>();
  const octaveShifts: OctaveShift[] = [];
  // Dynamics along the page: levels set, printed marks, hairpins (open ones by their number).
  const dynamicLevels: DynamicLevel[] = [];
  const dynamicMarks: DynamicMark[] = [];
  const hairpins: Hairpin[] = [];
  const dynamicAccents: DynamicAccent[] = [];
  const openHairpins = new Map<string, { start: number; type: Hairpin['type']; below: boolean }>();
  const pedalState: PedalState = { sustain: false, sostenuto: null, sostenutoLast: false };

  for (const measureElement of part.querySelectorAll(':scope > measure')) {
    const measure: Measure = { start: measureStart, length: 0, navigation: {}, sounds: [], tempos: [], pedal: [] };
    const nav = measure.navigation;
    if (ending) nav.ending = ending.numbers;
    let endingEndsHere = false;
    let cursor = 0; // position inside the measure, in divisions
    let longest = 0; // how far the measure reaches, in divisions
    let lastStart = 0; // start of the previous note, for chords
    let lastDelay = 0; // how much later than written it sounds (after an appoggiatura), for chords
    /** Grace notes read and not yet attached to the note they lead to, with their sounding pitch. */
    let pendingGraces: { printed: Omit<WrittenGrace, 'bar' | 'beat' | 'soundBeat' | 'soundBeats'>; pitch: number }[] = [];

    const beatAt = (position: number) => measureStart + position / divisions;

    /**
     * The grace notes read so far lead to `principal` at `position` (or, with no note to lead to,
     * stand before that place: after the bar's last note, before a rest). Places them on the page
     * and in time; returns how much later the principal itself now sounds.
     */
    const attachGraces = (position: number, principal: { beats: number; dotted: boolean } | null): number => {
      if (pendingGraces.length === 0) return 0;
      const beat = beatAt(position);
      const count = pendingGraces.filter((grace) => !grace.printed.chord).length;
      const timing = graceTiming({ count, slash: pendingGraces[0].printed.slash }, principal, beat);
      let slot = -1;
      for (const { printed, pitch } of pendingGraces) {
        if (!printed.chord || slot < 0) slot++;
        const soundBeat = timing.start + slot * timing.each;
        graces.push({ ...printed, bar: measures.length, beat, soundBeat, soundBeats: timing.each });
        measure.sounds.push({
          pitch,
          staff: printed.staff,
          beat: soundBeat,
          beats: timing.each,
          velocity: 0,
          ownDynamics: null,
          loudness: 1,
          hand: printed.hand,
          soundingLength: 1,
          tieStart: false,
          tieStop: false,
          fermata: false,
        });
      }
      pendingGraces = [];
      return timing.delay;
    };

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
          // A direction may sit before the note it belongs to, shifted by its <offset>; a <sound>
          // may carry one of its own.
          const offset = element.nodeName === 'direction' ? (childNumber(element, 'offset') ?? 0) : 0;
          const soundOffset = (sound && childNumber(sound, 'offset')) ?? offset;
          const tempo = Number(sound?.getAttribute('tempo'));
          if (tempo > 0) measure.tempos.push({ beat: beatAt(cursor + soundOffset), bpm: tempo });
          const mark = element.nodeName === 'direction' ? metronomeMark(element, beatAt(cursor + offset)) : null;
          if (mark) tempoMarks.push({ ...mark, printed: true });
          else if (tempo > 0) {
            tempoMarks.push({ beat: beatAt(cursor + soundOffset), unit: { value: 'quarter', dots: 0 }, perMinute: Math.round(tempo), printed: false });
          }
          const level = Number(sound?.getAttribute('dynamics'));
          readNavigation(element, sound, nav);
          const pedal = readPedal(element, sound, beatAt(cursor + offset), pedalState);
          measure.pedal.push(...pedal.events);
          pedalMarks.push(...pedal.marks);
          const shift = element.querySelector(':scope > direction-type > octave-shift');
          if (element.nodeName === 'direction') {
            const dynamicsAt = readDynamics(element, beatAt(cursor + offset), level > 0 ? level : null, openHairpins);
            dynamicMarks.push(...dynamicsAt.marks);
            hairpins.push(...dynamicsAt.hairpins);
            dynamicAccents.push(...dynamicsAt.accents);
            if (dynamicsAt.level !== null) dynamicLevels.push({ beat: beatAt(cursor + offset), level: dynamicsAt.level });
          } else if (level > 0) {
            dynamicLevels.push({ beat: beatAt(cursor), level });
          }
          if (shift) {
            const staff = childNumber(element, 'staff') ?? 1;
            const type = shift.getAttribute('type');
            const open = openShifts.get(staff);
            if (open && (type === 'stop' || type === 'up' || type === 'down')) {
              octaveShifts.push({ staff, start: open.start, end: beatAt(cursor + offset), octaves: open.octaves });
              openShifts.delete(staff);
            }
            // 8 is an octave, 15 two, 22 three. "down": printed lower than played, as under 8va.
            const octaves = Math.max(1, Math.round((Number(shift.getAttribute('size') ?? 8) - 1) / 7));
            if (type === 'up' || type === 'down') openShifts.set(staff, { start: beatAt(cursor + offset), octaves: type === 'down' ? octaves : -octaves });
          }
          break;
        }
        case 'backup':
          attachGraces(cursor, null);
          cursor -= childNumber(element, 'duration') ?? 0;
          break;
        case 'forward':
          attachGraces(cursor, null);
          cursor += childNumber(element, 'duration') ?? 0;
          longest = Math.max(longest, cursor);
          break;
        case 'note': {
          const graceElement = element.querySelector(':scope > grace');
          if (graceElement) {
            // A small note with no time of its own: kept until the note it leads to is read.
            const pitchElement = element.querySelector(':scope > pitch');
            if (!pitchElement) break;
            const staff = childNumber(element, 'staff') ?? 1;
            const hand: Hand = staves > 1 && staff > 1 ? 'left' : 'right';
            const clef = clefs.get(staff) ?? (staff > 1 ? 'bass' : 'treble');
            const read = readWritten(element, pitchElement, { staff, clef, hand, isChord: false, beat: 0, beats: 0, ties: [] });
            const shiftBy = openShifts.get(staff)?.octaves ?? 0;
            pendingGraces.push({
              printed: {
                staff,
                hand,
                clef,
                pitch: { ...read.pitch, octave: read.pitch.octave - shiftBy },
                accidental: read.accidental,
                chord: element.querySelector(':scope > chord') !== null,
                slash: graceElement.getAttribute('slash') === 'yes',
                // Without <type>, an eighth: what a lone grace note usually is.
                value: NOTE_TYPES[childText(element, 'type') ?? ''] ?? 'eighth',
                slur: read.slurs.some((slur) => slur.type === 'start'),
              },
              pitch: midiPitch(pitchElement),
            });
            break;
          }
          const duration = childNumber(element, 'duration') ?? 0;
          const isChord = element.querySelector(':scope > chord') !== null;
          const start = isChord ? lastStart : cursor;
          const restElement = element.querySelector(':scope > rest');
          if (!isChord) {
            const dotted = element.querySelector(':scope > dot') !== null;
            const principal = restElement || !element.querySelector(':scope > pitch') ? null : { beats: duration / divisions, dotted };
            lastDelay = attachGraces(cursor, principal);
            lastStart = cursor;
            cursor += duration;
            longest = Math.max(longest, cursor);
          }

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

          const shifted = readWritten(element, pitchElement, { staff, clef, hand, isChord, beat: beatAt(start), beats, ties });
          // <pitch> is what sounds; under an octave shift the note is printed octaves away from it.
          const shiftBy = openShifts.get(staff)?.octaves ?? 0;
          const printed = shiftBy ? { ...shifted, pitch: { ...shifted.pitch, octave: shifted.pitch.octave - shiftBy } } : shifted;
          written.push(printed);
          writtenMeasure.push(measures.length);

          const effect = articulationEffect(printed.articulations);
          const pitch = midiPitch(pitchElement);
          // After an appoggiatura the note comes in late, by what the grace note took from it.
          const soundBeat = beatAt(start) + lastDelay;
          const soundBeats = beats - lastDelay;
          // An ornament or a tremolo on the stem stands for several quick notes in the note's place.
          const [ornament] = printed.ornaments;
          const fifths = keySignatures[keySignatures.length - 1]?.fifths ?? 0;
          const pieces = ornament
            ? playOrnament(
                ornament.kind,
                pitch,
                soundBeats,
                neighbour(shifted.pitch, 1, fifths, ornament.accidentalAbove),
                neighbour(shifted.pitch, -1, fifths, ornament.accidentalBelow),
              )
            : printed.tremolo?.type === 'single'
              ? playTremolo(pitch, soundBeats, printed.tremolo.strokes)
              : [{ pitch, offset: 0, beats: soundBeats }];
          pieces.forEach((piece, i) => {
            const last = i === pieces.length - 1;
            measure.sounds.push({
              pitch: piece.pitch,
              staff,
              beat: soundBeat + piece.offset,
              beats: piece.beats,
              velocity: 0,
              ownDynamics: noteDynamics > 0 ? noteDynamics : null,
              loudness: effect.loudness,
              hand,
              soundingLength: last ? effect.length : 1,
              tieStart: last && ties.includes('start'),
              tieStop: i === 0 && ties.includes('stop'),
              fermata: printed.fermata !== null,
              ...(printed.arpeggio && pieces.length === 1 ? { roll: printed.arpeggio } : {}),
              ...(printed.tremolo && printed.tremolo.type !== 'single' ? { tremolo: { type: printed.tremolo.type, strokes: printed.tremolo.strokes } } : {}),
            });
          });
          break;
        }
      }
    }

    // Grace notes after the bar's last note stand before the bar line.
    attachGraces(cursor, null);
    measure.sounds = rollChords(alternateTremolos(measure.sounds));

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

  // A shift the file never stops ends with the music.
  for (const [staff, open] of openShifts) octaveShifts.push({ staff, start: open.start, end: measureStart, octaves: open.octaves });

  // Hairpins the file never stops end with the music; then every note gets its loudness.
  for (const open of openHairpins.values()) hairpins.push({ ...open, end: measureStart, drawn: true });
  hairpins.sort((a, b) => a.start - b.start);
  const levels = withHairpinLevels(dynamicLevels, hairpins, DEFAULT_DYNAMICS);
  for (const measure of measures) {
    for (const sound of measure.sounds) {
      // A sforzando (or the f of an fp) on the notes it is written at.
      const accent = dynamicAccents.find((a) => Math.abs(a.beat - sound.beat) < 1e-6);
      const level = sound.ownDynamics ?? accent?.level ?? levelAt(levels, hairpins, sound.beat, DEFAULT_DYNAMICS);
      sound.velocity = Math.min(1, ((level * 0.9) / 127) * sound.loudness * (accent?.factor ?? 1));
    }
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
      tempoMarks: distinctTempoMarks(tempoMarks),
      octaveShifts,
      dynamics: dynamicMarks,
      hairpins: hairpins.filter((h) => h.drawn),
      pedalMarks,
      timeSignatures,
      keySignatures,
      clefs: clefChanges,
      rests,
      graces,
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

/** A sudden stress written as a dynamic, on the notes at `beat`: louder by `factor`, or at `level`. */
interface DynamicAccent {
  beat: number;
  level?: number;
  factor: number;
}

/**
 * Marks that stress a note rather than set a level: sf, sfz, fz, rf… make it louder; fp and sfp
 * play it forte (sfp stressed too), and from then on piano (sfpp: pianissimo).
 */
const STRESS_MARKS: Readonly<Record<string, { factor: number; level?: string; after?: string }>> = {
  sf: { factor: 1.35 },
  sfz: { factor: 1.35 },
  sffz: { factor: 1.5 },
  fz: { factor: 1.35 },
  rf: { factor: 1.25 },
  rfz: { factor: 1.25 },
  fp: { factor: 1, level: 'f', after: 'p' },
  sfp: { factor: 1.35, level: 'f', after: 'p' },
  sfpp: { factor: 1.35, level: 'f', after: 'pp' },
};

/** Words that make music louder or softer until the next mark, like a hairpin. */
const CRESCENDO_WORDS = /^(cresc|crescendo)\b/i;
const DIMINUENDO_WORDS = /^(dim|dimin|diminuendo|decresc|decrescendo)\b/i;
/** How far "cresc." and "dim." reach when no mark follows (quarter notes): about a bar. */
const WORDS_REACH = 4;

/**
 * The dynamics a <direction> carries: printed marks (pp, mf, sfz…), hairpins (<wedge>), and the
 * words "cresc." / "dim.", which act like hairpins up to the next mark. A mark sets a level unless
 * the file gives its own (<sound dynamics>, `soundLevel`); stress marks (sfz, fp…) accent the notes
 * they are written at (see STRESS_MARKS).
 */
function readDynamics(
  direction: Element,
  beat: number,
  soundLevel: number | null,
  open: Map<string, { start: number; type: Hairpin['type']; below: boolean }>,
): { marks: DynamicMark[]; hairpins: Hairpin[]; accents: DynamicAccent[]; level: number | null } {
  const marks: DynamicMark[] = [];
  const hairpins: Hairpin[] = [];
  const accents: DynamicAccent[] = [];
  const staff = childNumber(direction, 'staff') ?? 1;
  // Marks for the lower staff printed under it; everything else between the staves.
  const below = staff >= 2 && direction.getAttribute('placement') === 'below';
  let level = soundLevel;

  for (const dynamics of direction.querySelectorAll(':scope > direction-type > dynamics')) {
    const text = [...dynamics.children]
      .map((mark) => (mark.nodeName === 'other-dynamics' ? (mark.textContent?.trim() ?? '') : mark.nodeName))
      .join('');
    if (!text) continue;
    marks.push({ beat, below, text, letters: /^[pmfrszn]+$/.test(text) });
    const stress = STRESS_MARKS[text];
    if (stress) {
      accents.push({ beat, factor: stress.factor, level: stress.level ? MARK_LEVELS[stress.level] : undefined });
      if (stress.after) level ??= MARK_LEVELS[stress.after];
    } else {
      level ??= MARK_LEVELS[text] ?? null;
    }
  }

  for (const wedge of direction.querySelectorAll(':scope > direction-type > wedge')) {
    const number = wedge.getAttribute('number') ?? '1';
    const type = wedge.getAttribute('type');
    if (type === 'crescendo' || type === 'diminuendo') open.set(number, { start: beat, type, below });
    else if (type === 'stop') {
      const started = open.get(number);
      if (started) hairpins.push({ ...started, end: beat, drawn: true });
      open.delete(number);
    }
  }

  for (const words of direction.querySelectorAll(':scope > direction-type > words')) {
    const text = words.textContent?.trim() ?? '';
    const type = CRESCENDO_WORDS.test(text) ? 'crescendo' : DIMINUENDO_WORDS.test(text) ? 'diminuendo' : null;
    if (!type) continue;
    marks.push({ beat, below, text, letters: false });
    hairpins.push({ start: beat, end: beat + WORDS_REACH, type, below, drawn: false });
  }
  return { marks, hairpins, accents, level };
}

/** A printed metronome mark: <metronome> with its beat unit (and dot) and the number per minute. */
function metronomeMark(direction: Element, beat: number): TempoMark | null {
  const metronome = direction.querySelector(':scope > direction-type > metronome');
  if (!metronome) return null;
  const value = NOTE_TYPES[childText(metronome, 'beat-unit') ?? ''];
  // Sometimes "c. 60" or "60-66": the first number is the one to show.
  const perMinute = parseFloat((childText(metronome, 'per-minute') ?? '').replace(/^[^\d]*/, ''));
  if (!value || !(perMinute > 0)) return null;
  const dots = metronome.querySelector(':scope > beat-unit-dot') ? 1 : 0;
  return { beat, unit: { value, dots }, perMinute: Math.round(perMinute) };
}

/**
 * Marks in page order, without repeats of the one in force (files often restate the tempo). At one
 * place a printed mark wins over one worked out from a bare <sound tempo>.
 */
function distinctTempoMarks(marks: (TempoMark & { printed: boolean })[]): TempoMark[] {
  const result: (TempoMark & { printed: boolean })[] = [];
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
  // The extra time of all fermatas before each one, so a beat only looks at the fermata it is in or after.
  const extraBefore: number[] = [0];
  for (const [from, to] of merged) {
    extraBefore.push(extraBefore[extraBefore.length - 1] + (toSeconds(to) - toSeconds(from)) * (FERMATA_HOLD - 1));
  }
  return (beat) => {
    const i = lastAtOrBefore(merged, beat, ([from]) => from); // the fermata `beat` is in, or the last one before it
    if (i < 0) return toSeconds(beat);
    const [from, to] = merged[i];
    const inside = (toSeconds(Math.min(beat, to)) - toSeconds(from)) * (FERMATA_HOLD - 1);
    return toSeconds(beat) + extraBefore[i] + inside;
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
    ornaments: ornamentsOf(element),
    trillLine: element.querySelector(':scope > notations > ornaments > wavy-line[type="start"]') !== null,
    tremolo: tremoloOf(element),
    arpeggio: element.querySelector(':scope > notations > arpeggiate')
      ? element.querySelector(':scope > notations > arpeggiate')!.getAttribute('direction') === 'down'
        ? 'down'
        : 'up'
      : null,
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

/** The ornament signs of a <note>, each with the small accidentals printed after it. */
function ornamentsOf(element: Element): OrnamentMark[] {
  const marks: { -readonly [K in keyof OrnamentMark]: OrnamentMark[K] }[] = [];
  for (const child of element.querySelectorAll(':scope > notations > ornaments > *')) {
    const kind = ORNAMENTS[child.nodeName];
    if (kind) {
      marks.push({ kind, accidentalAbove: null, accidentalBelow: null, below: child.getAttribute('placement') === 'below' });
    } else if (child.nodeName === 'accidental-mark' && marks.length > 0) {
      const accidental = ACCIDENTALS[child.textContent?.trim() ?? ''] ?? null;
      const mark = marks[marks.length - 1];
      // A trill only has a note above; elsewhere the file says which neighbour the accidental is for.
      if (child.getAttribute('placement') === 'below' && mark.kind !== 'trill') mark.accidentalBelow = accidental;
      else mark.accidentalAbove = accidental;
    }
  }
  return marks;
}

function tremoloOf(element: Element): WrittenNote['tremolo'] {
  const tremolo = element.querySelector(':scope > notations > ornaments > tremolo');
  if (!tremolo) return null;
  const type = tremolo.getAttribute('type');
  const strokes = Math.min(4, Math.max(1, Number(tremolo.textContent) || 3));
  return { type: type === 'start' || type === 'stop' ? type : 'single', strokes };
}

/**
 * Tremolos between two notes or chords: the two are played in turn for their whole length
 * together, instead of one after the other.
 */
function alternateTremolos(sounds: SoundEvent[]): SoundEvent[] {
  if (!sounds.some((sound) => sound.tremolo)) return sounds;
  const result = sounds.filter((sound) => !sound.tremolo);
  const same = (a: SoundEvent, b: SoundEvent) => a.staff === b.staff && Math.abs(a.beat - b.beat) < 1e-6;
  const starts = sounds.filter((sound) => sound.tremolo?.type === 'start');
  const stops = sounds.filter((sound) => sound.tremolo?.type === 'stop');
  const done = new Set<SoundEvent>();
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
function rollChords(sounds: SoundEvent[]): SoundEvent[] {
  const rolled = sounds.filter((sound) => sound.roll);
  const done = new Set<SoundEvent>();
  for (const first of rolled) {
    if (done.has(first)) continue;
    const chord = rolled.filter((sound) => Math.abs(sound.beat - first.beat) < 1e-6);
    chord.sort((a, b) => (first.roll === 'down' ? b.pitch - a.pitch : a.pitch - b.pitch));
    const delays = arpeggioDelays(chord.length, Math.min(...chord.map((sound) => sound.beats)));
    chord.forEach((sound, i) => {
      done.add(sound);
      sound.beat += delays[i];
      sound.beats -= delays[i];
    });
  }
  return sounds;
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
    const segment = segments[Math.max(0, lastAtOrBefore(segments, beat, (s) => s.beat))];
    return segment.seconds + (beat - segment.beat) * segment.secondsPerBeat;
  };
}
