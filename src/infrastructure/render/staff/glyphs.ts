import type { NoteValue } from '../../../domain/notation/noteValue';
import type { OrnamentKind } from '../../../domain/notation/ornaments';
import type { Accidental } from '../../../domain/notation/spelling';
import type { Clef } from '../staffLayout';
import type { StaffMark } from '../../../domain/notation/engraving';

/*
 * Glyphs of the SMuFL standard (Bravura font). By the standard, a font size of 4 staff spaces
 * makes glyphs the right size for the staff, and each glyph's baseline is its reference line.
 */
export const MUSIC_FONT = 'Bravura';
/** Words in the music (tempo, dynamics, jumps, hand marks), as engravers set them. */
export const TEXT_FONT = "'Times New Roman', Georgia, serif";
/** Bar numbers and volta labels. */
export const LABEL_FONT = 'system-ui, sans-serif';

const G_CLEF = '';
const F_CLEF = '';
/** Smaller clefs for a change in the middle of the music. */
const G_CLEF_CHANGE = '';
const F_CLEF_CHANGE = ''; // (U+E07B is the C clef change)
/** A clef sits on its reference line: G on the second line from the bottom, F on the second from the top. */
export const CLEF_LINE_STEP: Record<Clef, number> = { treble: 6, bass: 2 };
export const CLEF_GLYPH: Record<Clef, string> = { treble: G_CLEF, bass: F_CLEF };
export const CLEF_CHANGE_GLYPH: Record<Clef, string> = { treble: G_CLEF_CHANGE, bass: F_CLEF_CHANGE };

export const SHARP = '';
export const FLAT = '';
export const NATURAL = '';
export const ACCIDENTAL_GLYPH: Record<Accidental, string> = {
  sharp: SHARP,
  flat: FLAT,
  natural: NATURAL,
  'double-sharp': '',
  'double-flat': '',
};

export const NOTEHEAD: Record<NoteValue, string> = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
  thirtySecond: '',
};
/** Notehead widths (Bravura), for centring heads on their beat. */
export const HEAD_WIDTH: Record<NoteValue, number> = {
  whole: 1.69,
  half: 1.18,
  quarter: 1.18,
  eighth: 1.18,
  sixteenth: 1.18,
  thirtySecond: 1.18,
};
/** Flags by count (1–3), stem up and stem down. */
export const FLAG_UP = ['', '', '', ''];
export const FLAG_DOWN = ['', '', '', ''];
export const AUGMENTATION_DOT = '';

export const REST: Record<NoteValue, string> = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
  thirtySecond: '',
};
/** Rest widths (Bravura), for centring them on their beat. */
export const REST_WIDTH: Record<NoteValue, number> = {
  whole: 1.13,
  half: 1.13,
  quarter: 1.08,
  eighth: 1.0,
  sixteenth: 1.28,
  thirtySecond: 1.5,
};

/** Articulation and fermata glyphs: [above, below]. */
export const MARK_GLYPHS: Record<StaffMark['kind'], [string, string]> = {
  staccato: ['', ''],
  staccatissimo: ['', ''],
  tenuto: ['', ''],
  portato: ['', ''],
  accent: ['', ''],
  marcato: ['', ''],
  fermata: ['', ''],
};

/** Ornament signs: "tr", the turn and its mirror image, the short trill, and the mordent (struck through). */
export const ORNAMENT_GLYPHS: Record<OrnamentKind, string> = {
  trill: '\uE566',
  turn: '\uE567',
  'inverted-turn': '\uE568',
  'delayed-turn': '\uE567',
  'delayed-inverted-turn': '\uE568',
  'inverted-mordent': '\uE56C',
  mordent: '\uE56D',
};

/** Repeat barlines (with their dots), segno and coda signs. */
export const REPEAT_LEFT = '';
export const REPEAT_RIGHT = '';
export const SEGNO = '';
export const CODA = '';

/** Pedal signs ("Ped." and "✱"), and "Sost." for the middle pedal. */
export const PEDAL_PRESS = '';
export const PEDAL_RELEASE = '';
export const PEDAL_SOSTENUTO = '';

/** Octave shifts: 8va, 15ma, 22ma over the notes; 8vb, 15mb, 22mb under them. */
export const OCTAVE_GLYPH_ABOVE = ['', '', ''];
export const OCTAVE_GLYPH_BELOW = ['', '', ''];

/** Dynamic letters p, m, f, r, s, z, n: combined into marks (pp, sfz…). */
export const DYNAMIC_LETTERS: Readonly<Record<string, string>> = {
  p: '',
  m: '',
  f: '',
  r: '',
  s: '',
  z: '',
  n: '',
};

/** The small notes of metronome marks. */
export const METRONOME_NOTE: Record<NoteValue, string> = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
  thirtySecond: '',
};
export const METRONOME_DOT = '';

/** Tuplet digits 0–9 are consecutive code points from U+E880. */
export const tupletDigits = (value: number) =>
  [...String(value)].map((digit) => String.fromCodePoint(0xe880 + Number(digit))).join('');
/** Time signature digits 0–9 are consecutive code points from U+E080. */
export const timeDigits = (value: number) =>
  [...String(value)].map((digit) => String.fromCodePoint(0xe080 + Number(digit))).join('');
