import { ScoreLoadError, type ScoreParser } from '../../application/ports/ScoreParser';
import type { Hand } from '../../domain/note';
import { dynamicWords, isDynamicLetters, type DynamicLevel, type DynamicMark, type Hairpin } from '../../domain/notation/dynamics';
import type { BarNavigation } from '../../domain/notation/navigation';
import type { Notation, PedalMove as BarPedalMove, TempoChange } from '../../domain/notation/notation';
import { writtenDuration, type NoteValue } from '../../domain/notation/noteValue';
import type { OrnamentKind, OrnamentMark } from '../../domain/notation/ornaments';
import { performNotation } from '../../domain/notation/performance';
import type { Accidental, Alteration, Letter } from '../../domain/notation/spelling';
import type {
  Articulation,
  BeamMark,
  Clef,
  ClefChange,
  SlurMark,
  WrittenGrace,
  WrittenGraces,
  WrittenNote,
  WrittenRest,
} from '../../domain/notation/written';
import { softPedalWords, type PedalKind, type PedalMark } from '../../domain/pedal';
import type { KeySignature, OctaveShift, Score, TempoMark, TimeSignature } from '../../domain/score';
import { pianoPart } from './pianoParts';
import { InvalidZipError, isZip, readZip } from './zip';

/*
 * MusicXML (https://www.w3.org/2021/06/musicxml40/): the notation format of MuseScore, Finale,
 * Sibelius and others. This reader only takes down what the file says is printed (see Notation
 * in the domain); how that is played is the domain's business (performNotation).
 *
 * Plain files (.musicxml, .xml) and compressed ones (.mxl, a ZIP archive with the score inside).
 * Not yet: more than one part (the first one is read; a piano written as
 * two one-staff parts is joined into one, see pianoParts).
 */

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
    return performNotation(readPart(part, workTitle(root) ?? title));
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

type MutableNavigation = { -readonly [K in keyof BarNavigation]: BarNavigation[K] };

/**
 * Reads a part along the page, bar by bar, into its notation: the printed notes, rests, clefs,
 * signatures and marks, as they stand. How all this is played is not decided here (see
 * performNotation in the domain).
 */
function readPart(part: Element, title: string): Notation {
  let divisions = 1;
  let staves = 1;
  let measureStart = 0; // along the page, in quarter notes
  let timeSignature: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
  let ending: { numbers: number[]; label: string } | null = null;

  const bars: { start: number; length: number; navigation: MutableNavigation }[] = [];
  const notes: WrittenNote[] = [];
  const rests: WrittenRest[] = [];
  const graces: WrittenGraces[] = [];
  const clefChanges: ClefChange[] = [];
  /** The clef in force on each staff; engravers may switch the lower staff to treble and back. */
  const clefs = new Map<number, Clef>([
    [1, 'treble'],
    [2, 'bass'],
  ]);
  const timeSignatures: TimeSignature[] = [];
  const keySignatures: KeySignature[] = [];
  const tempos: TempoChange[] = [];
  const pedalMoves: BarPedalMove[] = [];
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
  const openHairpins = new Map<string, { start: number; type: Hairpin['type']; below: boolean }>();
  const pedalState: PedalState = { sustain: false, sostenuto: null, sostenutoLast: false };

  for (const measureElement of part.querySelectorAll(':scope > measure')) {
    const bar = bars.length;
    const nav: MutableNavigation = {};
    if (ending) nav.ending = ending.numbers;
    let endingEndsHere = false;
    let cursor = 0; // position inside the measure, in divisions
    let longest = 0; // how far the measure reaches, in divisions
    let lastStart = 0; // start of the previous note, for chords
    /** Grace notes read and not yet attached to the note they lead to. */
    let pendingGraces: WrittenGrace[] = [];

    const beatAt = (position: number) => measureStart + position / divisions;

    /**
     * The grace notes read so far stand before `position`: they lead to the note about to be read
     * there (`toNextNote`), or to none (after the bar's last note, before a rest).
     */
    const attachGraces = (position: number, toNextNote: boolean): void => {
      if (pendingGraces.length === 0) return;
      graces.push({ bar, beat: beatAt(position), leadsTo: toNextNote ? notes.length : null, notes: pendingGraces });
      pendingGraces = [];
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
          if (tempo > 0) tempos.push({ bar, beat: beatAt(cursor + soundOffset), bpm: tempo });
          const mark = element.nodeName === 'direction' ? metronomeMark(element, beatAt(cursor + offset)) : null;
          if (mark) tempoMarks.push({ ...mark, printed: true });
          else if (tempo > 0) {
            tempoMarks.push({ beat: beatAt(cursor + soundOffset), unit: { value: 'quarter', dots: 0 }, perMinute: Math.round(tempo), printed: false });
          }
          const level = Number(sound?.getAttribute('dynamics'));
          readNavigation(element, sound, nav);
          const pedal = readPedal(element, sound, beatAt(cursor + offset), pedalState);
          pedalMoves.push(...pedal.events.map((event) => ({ bar, ...event })));
          pedalMarks.push(...pedal.marks);
          const shift = element.querySelector(':scope > direction-type > octave-shift');
          if (element.nodeName === 'direction') {
            const dynamicsAt = readDynamics(element, beatAt(cursor + offset), level > 0 ? level : null, openHairpins);
            dynamicMarks.push(...dynamicsAt.marks);
            hairpins.push(...dynamicsAt.hairpins);
            // A level with no mark printed for it.
            if (level > 0 && dynamicsAt.marks.length === 0) dynamicLevels.push({ beat: beatAt(cursor + offset), level });
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
          attachGraces(cursor, false);
          cursor -= childNumber(element, 'duration') ?? 0;
          break;
        case 'forward':
          attachGraces(cursor, false);
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
              sounding: midiPitch(pitchElement),
            });
            break;
          }
          const duration = childNumber(element, 'duration') ?? 0;
          const isChord = element.querySelector(':scope > chord') !== null;
          const start = isChord ? lastStart : cursor;
          const restElement = element.querySelector(':scope > rest');
          if (!isChord) {
            attachGraces(cursor, !restElement && element.querySelector(':scope > pitch') !== null);
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
          notes.push({
            ...shifted,
            pitch: shiftBy ? { ...shifted.pitch, octave: shifted.pitch.octave - shiftBy } : shifted.pitch,
            bar,
            sounding: midiPitch(pitchElement),
            dynamics: noteDynamics > 0 ? noteDynamics : null,
          });
          break;
        }
      }
    }

    // Grace notes after the bar's last note stand before the bar line.
    attachGraces(cursor, false);

    // Files do not always close the last volta. A new ‖: never sits inside one, so it closes it.
    if (nav.repeatStart && ending && !nav.endingLabel) {
      delete nav.ending;
      ending = null;
    }

    // A pickup bar is shorter than its time signature says; trust what the measure contains.
    const nominal = (timeSignature.numerator * 4) / timeSignature.denominator;
    const length = longest > 0 ? longest / divisions : nominal;
    bars.push({ start: measureStart, length, navigation: nav });
    measureStart += length;
    if (endingEndsHere) ending = null;
  }

  // A shift or a hairpin the file never stops ends with the music.
  for (const [staff, open] of openShifts) octaveShifts.push({ staff, start: open.start, end: measureStart, octaves: open.octaves });
  for (const open of openHairpins.values()) hairpins.push({ ...open, end: measureStart, drawn: true });

  return {
    title,
    bars,
    notes,
    graces,
    rests,
    clefs: clefChanges,
    keySignatures,
    timeSignatures,
    tempos,
    tempoMarks,
    pedalMoves,
    pedalMarks,
    octaveShifts,
    dynamics: dynamicMarks,
    hairpins,
    dynamicLevels,
  };
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
 * The dynamics a <direction> carries: printed marks (pp, mf, sfz…), the words "cresc." / "dim.",
 * and hairpins (<wedge>). When the file gives its own level (<sound dynamics>, `soundLevel`), the
 * marks carry it in place of their usual one.
 */
function readDynamics(
  direction: Element,
  beat: number,
  soundLevel: number | null,
  open: Map<string, { start: number; type: Hairpin['type']; below: boolean }>,
): { marks: DynamicMark[]; hairpins: Hairpin[] } {
  const marks: DynamicMark[] = [];
  const hairpins: Hairpin[] = [];
  const staff = childNumber(direction, 'staff') ?? 1;
  // Marks for the lower staff printed under it; everything else between the staves.
  const below = staff >= 2 && direction.getAttribute('placement') === 'below';
  const level = soundLevel === null ? {} : { level: soundLevel };

  for (const dynamics of direction.querySelectorAll(':scope > direction-type > dynamics')) {
    const text = [...dynamics.children]
      .map((mark) => (mark.nodeName === 'other-dynamics' ? (mark.textContent?.trim() ?? '') : mark.nodeName))
      .join('');
    if (text) marks.push({ beat, below, text, letters: isDynamicLetters(text), ...level });
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
    if (dynamicWords(text)) marks.push({ beat, below, text, letters: false, ...level });
  }
  return { marks, hairpins };
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

/** A pedal going down or coming up at `beat` along the page. */
type PedalMove = { pedal: PedalKind; beat: number; down: boolean };

/** "yes" / "no", or how far down a pedal is in percent. */
const pedalDown = (value: string) => value === 'yes' || (value !== 'no' && Number(value) >= 50);

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
  const soft = words.find((text) => softPedalWords(text) !== null);
  if (soft) {
    const down = softPedalWords(soft) === 'down';
    events.push({ pedal: 'soft', beat, down });
    marks.push({ pedal: 'soft', beat, type: down ? 'start' : 'stop', sign: false, line: false, text: soft });
  } else {
    const value = sound?.getAttribute('soft-pedal');
    if (value) events.push({ pedal: 'soft', beat, down: pedalDown(value) });
  }
  return { events, marks };
}

/** The printed side of a <note>: what the engraver wrote, taken as is. */
function readWritten(
  element: Element,
  pitchElement: Element,
  at: { staff: number; clef: Clef; hand: Hand; isChord: boolean; beat: number; beats: number; ties: (string | null)[] },
): Omit<WrittenNote, 'bar' | 'sounding' | 'dynamics'> {
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
