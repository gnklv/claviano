import { ScoreLoadError, type ScoreParser } from '../../application/ports/ScoreParser';
import type { Hand, Note } from '../../domain/note';
import { writtenDuration, type NoteValue } from '../../domain/notation/noteValue';
import type { Accidental, Alteration, Letter } from '../../domain/notation/spelling';
import type { BeamMark, Clef, ClefChange, WrittenNote } from '../../domain/notation/written';
import { createScore, type KeySignature, type Score, type TimeSignature } from '../../domain/score';

/*
 * MusicXML (https://www.w3.org/2021/06/musicxml40/): the notation format of MuseScore, Finale,
 * Sibelius and others. It gives two views of the music: sounding notes for playback (tied notes
 * become one), and the notes as printed for the staff (value, tuplet, accidental, stem, beams).
 *
 * Only uncompressed files (.musicxml, .xml); compressed .mxl archives are not read.
 * Not yet: repeats and voltas (the piece plays straight through), grace notes (skipped),
 * more than one part (the first one is read).
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
}

/** A printed note before its seconds are known (they need the whole tempo map). */
type PendingWritten = Omit<WrittenNote, 'start' | 'end'> & { beats: number };

function readPart(part: Element, title: string): Score {
  let divisions = 1;
  let staves = 1;
  let dynamics = DEFAULT_DYNAMICS;
  let measureStart = 0; // in quarter notes
  let timeSignature: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };

  const notes: PendingNote[] = [];
  const written: PendingWritten[] = [];
  const clefChanges: ClefChange[] = [];
  /** The clef in force on each staff; engravers may switch the lower staff to treble and back. */
  const clefs = new Map<number, Clef>([
    [1, 'treble'],
    [2, 'bass'],
  ]);
  const barBeats: number[] = [];
  const timeSignatures: TimeSignature[] = [];
  const keySignatures: KeySignature[] = [];
  const tempos: { beat: number; bpm: number }[] = [];
  /** Notes waiting for the rest of a tie, by pitch and staff. */
  const openTies = new Map<string, PendingNote>();

  for (const measure of part.querySelectorAll(':scope > measure')) {
    barBeats.push(measureStart);
    let cursor = 0; // position inside the measure, in divisions
    let longest = 0; // how far the measure reaches, in divisions
    let lastStart = 0; // start of the previous note, for chords

    const beatAt = (position: number) => measureStart + position / divisions;

    for (const element of measure.children) {
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
        case 'direction':
        case 'sound': {
          const sound = element.nodeName === 'sound' ? element : element.querySelector(':scope > sound');
          const tempo = Number(sound?.getAttribute('tempo'));
          if (tempo > 0) tempos.push({ beat: beatAt(cursor), bpm: tempo });
          const level = Number(sound?.getAttribute('dynamics'));
          if (level > 0) dynamics = level;
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

          const pitchElement = element.querySelector(':scope > pitch');
          if (!pitchElement) break; // a rest (or an unpitched note)
          const pitch = midiPitch(pitchElement);
          const staff = childNumber(element, 'staff') ?? 1;
          const noteDynamics = Number(element.getAttribute('dynamics'));
          const ties = [...element.querySelectorAll(':scope > tie')].map((tie) => tie.getAttribute('type'));
          const tieKey = `${pitch}|${staff}`;

          const beats = duration / divisions;
          const hand: Hand = staves > 1 && staff > 1 ? 'left' : 'right';
          const clef = clefs.get(staff) ?? (staff > 1 ? 'bass' : 'treble');
          written.push(readWritten(element, pitchElement, { staff, clef, hand, isChord, beat: beatAt(start), beats }));

          const continued = ties.includes('stop') ? openTies.get(tieKey) : undefined;
          if (continued) {
            // The second half of a tie: the note keeps sounding, so lengthen the first one.
            continued.beats = beatAt(start) + beats - continued.beat;
            if (!ties.includes('start')) openTies.delete(tieKey);
            break;
          }
          const note: PendingNote = {
            pitch,
            beat: beatAt(start),
            beats,
            velocity: Math.min(1, ((noteDynamics > 0 ? noteDynamics : dynamics) * 0.9) / 127),
            hand,
          };
          notes.push(note);
          if (ties.includes('start')) openTies.set(tieKey, note);
          break;
        }
      }
    }

    // A pickup bar is shorter than its time signature says; trust what the measure contains.
    const nominal = (timeSignature.numerator * 4) / timeSignature.denominator;
    measureStart += longest > 0 ? longest / divisions : nominal;
  }

  const toSeconds = beatsToSecondsConverter(tempos);
  return createScore(
    title,
    notes.map(
      (n): Note => ({
        pitch: n.pitch,
        start: toSeconds(n.beat),
        duration: toSeconds(n.beat + n.beats) - toSeconds(n.beat),
        beat: n.beat,
        beats: n.beats,
        velocity: n.velocity,
        hand: n.hand,
      }),
    ),
    barBeats.map(toSeconds),
    {
      barBeats,
      timeSignatures,
      keySignatures,
      clefs: clefChanges,
      written: written.map(({ beats, ...note }) => ({
        ...note,
        start: toSeconds(note.beat),
        end: toSeconds(note.beat + beats),
      })),
    },
  );
}

/** The printed side of a <note>: what the engraver wrote, taken as is. */
function readWritten(
  element: Element,
  pitchElement: Element,
  at: { staff: number; clef: Clef; hand: Hand; isChord: boolean; beat: number; beats: number },
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
