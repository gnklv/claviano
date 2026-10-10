import { writtenDuration, type NoteValue } from '../../../domain/notation/noteValue';
import type { Hand } from '../../../domain/note';
import type { OrnamentKind, OrnamentMark } from '../../../domain/notation/ornaments';
import type { Accidental, Alteration, Letter } from '../../../domain/notation/spelling';
import type { Articulation, BeamMark, Clef, SlurMark, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import { childNumber, childText, InvalidMusicXmlError } from './xml';

/* What a <note> says: a printed note with its signs, a rest, the pitch that sounds. */

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEP_LETTERS: Record<string, Letter> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** MusicXML note types we can draw; shorter ones are drawn as thirty-seconds, longer as wholes. */
export const NOTE_TYPES: Record<string, NoteValue> = {
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

/** The printed side of a <note>: what the engraver wrote, taken as is. */
export function readWritten(
  element: Element,
  pitchElement: Element,
  at: { staff: number; clef: Clef; hand: Hand; isChord: boolean; beat: number; beats: number; ties: (string | null)[] },
): Omit<WrittenNote, 'bar' | 'sounding' | 'dynamics'> {
  const letter = STEP_LETTERS[childText(pitchElement, 'step') ?? ''];
  if (letter === undefined) throw new InvalidMusicXmlError('A note without a valid pitch');
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
      letter,
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
    ...(/cue/.test(element.querySelector(':scope > type')?.getAttribute('size') ?? '') ? { small: true } : {}),
    ...fingeringOf(element),
    ...(element.querySelector(':scope > notehead')?.getAttribute('parentheses') === 'yes' ? { parenthesized: true } : {}),
    ...(element.getAttribute('print-object') === 'no' ? { hidden: true } : {}),
    ...(childText(element, 'notehead') === 'none' ? { headless: true } : {}),
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

/** The finger printed at a <note>, if any. */
function fingeringOf(element: Element): Pick<WrittenNote, 'fingering'> {
  const fingering = element.querySelector(':scope > notations > technical > fingering');
  const text = fingering?.textContent?.trim();
  if (!fingering || !text) return {};
  const placement = fingering.getAttribute('placement');
  return { fingering: { text, below: placement === 'below' ? true : placement === 'above' ? false : null } };
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
      const mark = marks.at(-1)!;
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
export function readRest(
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
export function midiPitch(pitch: Element): number {
  const step = STEP_SEMITONES[childText(pitch, 'step') ?? ''];
  const octave = childNumber(pitch, 'octave');
  if (step === undefined || octave === null) throw new InvalidMusicXmlError('A note without a valid pitch');
  return 12 * (octave + 1) + step + Math.round(childNumber(pitch, 'alter') ?? 0);
}
